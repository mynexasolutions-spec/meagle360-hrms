"""PAN and bank details: employees ask for a change, HR approves it.

Salary is paid into this account, so an employee's own change never goes
straight onto their record: HR checks it (optionally against a cancelled
cheque / PAN card) and someone other than the employee approves it.
"""

import logging
import re
from datetime import datetime, timezone
from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from app.models.bank_detail_request import BankDetailRequest
from app.models.employee import Employee
from app.services import document_storage
from app.services.audit_service import log_action
from app.services.geofence_service import GeofenceService, _notify
from app.services.required_document_service import detect_type

logger = logging.getLogger(__name__)

PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
ACCOUNT_RE = re.compile(r"^[0-9]{9,18}$")
FIELDS = ("pan_number", "bank_account_number", "bank_ifsc", "bank_name")
BANK_FIELDS = ("bank_account_number", "bank_ifsc", "bank_name")
PROOF_FOLDER = "bank-proofs"
IFSC_API = "https://ifsc.razorpay.com/"


class RequestConflict(Exception):
    pass


class IfscUnavailable(Exception):
    pass


def mask_account(number: str | None) -> str | None:
    if not number or len(number) < 4:
        return None
    return f"**** **** {number[-4:]}"


def normalize(data: dict) -> dict:
    """Upper-case codes, drop spaces, and check each format. Empty → None."""
    out = {}
    for key in FIELDS:
        value = (data.get(key) or "").strip()
        if key in ("pan_number", "bank_ifsc", "bank_account_number"):
            value = re.sub(r"\s+", "", value).upper()
        else:
            value = re.sub(r"\s+", " ", value)
        out[key] = value or None
    if out["pan_number"] and not PAN_RE.match(out["pan_number"]):
        raise ValueError("PAN must look like ABCDE1234F.")
    if out["bank_ifsc"] and not IFSC_RE.match(out["bank_ifsc"]):
        raise ValueError("IFSC must be 11 characters, like SBIN0001234.")
    if out["bank_account_number"] and not ACCOUNT_RE.match(out["bank_account_number"]):
        raise ValueError("Account number must be 9 to 18 digits.")
    if out["bank_name"] and len(out["bank_name"]) > 150:
        raise ValueError("Bank name is too long.")
    given = [k for k in BANK_FIELDS if out[k]]
    if given and len(given) != len(BANK_FIELDS):
        raise ValueError("Enter the account number, IFSC and bank name together.")
    return out


def payslip_bank_details(payslip) -> dict:
    """What a payslip shows: its own copy once finalized, else the live record."""
    run = getattr(payslip, "payroll_run", None)
    source = payslip if run is not None and run.status == "finalized" else payslip.employee
    return {key: getattr(source, key, None) if source is not None else None for key in FIELDS}


def snapshot_payslip(payslip, employee: Employee | None) -> None:
    for key in FIELDS:
        setattr(payslip, key, getattr(employee, key, None) if employee is not None else None)


def lookup_ifsc(code: str) -> dict:
    """Bank and branch for an IFSC code (Razorpay's free public directory)."""
    code = re.sub(r"\s+", "", code or "").upper()
    if not IFSC_RE.match(code):
        raise ValueError("IFSC must be 11 characters, like SBIN0001234.")
    try:
        with httpx.Client(timeout=5.0) as client:
            res = client.get(IFSC_API + code)
    except httpx.HTTPError as e:
        raise IfscUnavailable(type(e).__name__) from e
    if res.status_code == 404:
        raise LookupError("No bank branch has this IFSC code.")
    if res.status_code >= 300:
        raise IfscUnavailable(f"status {res.status_code}")
    body = res.json()
    return {"ifsc": code, "bank": body.get("BANK"), "branch": body.get("BRANCH"), "city": body.get("CITY")}


class BankDetailService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    # ── lookups ───────────────────────────────────────────
    def employee(self, employee_id: UUID) -> Employee:
        emp = self.db.query(Employee).filter_by(id=employee_id, company_id=self.company_id).first()
        if emp is None:
            raise LookupError("Employee not found")
        return emp

    def get(self, request_id: UUID) -> BankDetailRequest:
        req = self.db.query(BankDetailRequest).filter_by(id=request_id, company_id=self.company_id).first()
        if req is None:
            raise LookupError("Request not found")
        return req

    def _pending(self, employee_id: UUID) -> BankDetailRequest | None:
        return (self.db.query(BankDetailRequest)
                .filter_by(company_id=self.company_id, employee_id=employee_id, status="pending").first())

    @staticmethod
    def _current(emp: Employee) -> dict:
        return {
            "pan_number": emp.pan_number, "bank_name": emp.bank_name, "bank_ifsc": emp.bank_ifsc,
            "bank_account_masked": mask_account(emp.bank_account_number),
        }

    @staticmethod
    def _request_dict(r: BankDetailRequest, full_account: bool) -> dict:
        return {
            "id": r.id, "employee_id": r.employee_id,
            "employee_name": r.employee.full_name if r.employee else None,
            "employee_code": r.employee.employee_code if r.employee else None,
            "pan_number": r.pan_number, "bank_name": r.bank_name, "bank_ifsc": r.bank_ifsc,
            # The employee typed it; HR needs the whole number to check the proof.
            "bank_account_number": r.bank_account_number if full_account else None,
            "bank_account_masked": mask_account(r.bank_account_number),
            "has_proof": bool(r.proof_storage_path), "proof_filename": r.proof_filename,
            "status": r.status, "review_note": r.review_note,
            "reviewed_by_name": r.reviewed_by.full_name if r.reviewed_by else None,
            "reviewed_at": r.reviewed_at, "created_at": r.created_at,
        }

    # ── employee side ─────────────────────────────────────
    def my_details(self, employee_id: UUID) -> dict:
        emp = self.employee(employee_id)
        latest = (self.db.query(BankDetailRequest)
                  .filter_by(company_id=self.company_id, employee_id=employee_id)
                  .order_by(BankDetailRequest.created_at.desc()).first())
        return {
            "current": self._current(emp),
            "latest_request": self._request_dict(latest, full_account=False) if latest else None,
        }

    def submit(self, employee_id: UUID, data: dict, proof: bytes | None, proof_filename: str | None) -> dict:
        emp = self.employee(employee_id)
        values = normalize(data)
        changes = {k: v for k, v in values.items() if v is not None and v != getattr(emp, k)}
        if not changes:
            raise ValueError("Nothing to change: these are already your details.")
        if self._pending(employee_id):
            raise RequestConflict("You already have a change waiting for HR. Cancel it to send a new one.")

        req = BankDetailRequest(company_id=self.company_id, employee_id=employee_id, status="pending",
                                **{k: values[k] for k in FIELDS if k in changes or
                                   (k in BANK_FIELDS and any(b in changes for b in BANK_FIELDS))})
        storage_id = None
        if proof is not None:
            content_type = detect_type(proof)
            storage_id, storage_path = document_storage.save(
                self.company_id, employee_id, proof, content_type, subfolder=PROOF_FOLDER)
            req.proof_filename = (proof_filename or "proof")[:200]
            req.proof_content_type = content_type
            req.proof_storage_id, req.proof_storage_path = storage_id, storage_path
        try:
            self.db.add(req)
            self.db.flush()
            log_action(self.db, self.company_id, employee_id, "bank_details.requested", "bank_detail_request",
                       req.id, {"title": emp.full_name, "fields": sorted(changes)})
            for reviewer in GeofenceService(self.db, self.company_id)._reviewer_ids():
                if reviewer != employee_id:
                    _notify(self.db, self.company_id, reviewer, employee_id, "bank_details_requested",
                            "Bank / PAN change to review",
                            f"{emp.full_name} asked to update their bank or PAN details.",
                            "bank_detail_request", req.id, "/employee-documents?tab=bank")
            self.db.commit()
        except Exception:
            self.db.rollback()
            if storage_id:
                document_storage.remove(storage_id)
            raise
        self.db.refresh(req)
        return self._request_dict(req, full_account=False)

    def cancel(self, employee_id: UUID, request_id: UUID) -> None:
        req = self.get(request_id)
        if req.employee_id != employee_id:
            raise LookupError("Request not found")
        if req.status != "pending":
            raise ValueError(f"This request is already {req.status}.")
        req.status = "cancelled"
        storage_id, req.proof_storage_id, req.proof_storage_path = req.proof_storage_id, None, None
        log_action(self.db, self.company_id, employee_id, "bank_details.cancelled", "bank_detail_request", req.id)
        self.db.commit()
        if storage_id:
            document_storage.remove(storage_id)

    # ── HR side ───────────────────────────────────────────
    def list(self, status: str | None = "pending") -> list[dict]:
        q = self.db.query(BankDetailRequest).filter_by(company_id=self.company_id)
        if status:
            q = q.filter(BankDetailRequest.status == status)
        rows = q.order_by(BankDetailRequest.created_at.desc()).limit(200).all()
        out = []
        for r in rows:
            item = self._request_dict(r, full_account=True)
            item["current"] = self._current(r.employee) if r.employee else None
            out.append(item)
        return out

    def review(self, request_id: UUID, reviewer_id: UUID | None, decision: str, note: str | None) -> dict:
        req = self.get(request_id)
        if req.status != "pending":
            raise ValueError(f"This request is already {req.status}.")
        if reviewer_id is not None and reviewer_id == req.employee_id:
            raise PermissionError("Someone else must approve a change to your own bank details.")
        note = (note or "").strip() or None
        if decision == "rejected" and not note:
            raise ValueError("Tell the employee why it was rejected.")

        emp = self.employee(req.employee_id)
        if decision == "approved":
            for key in FIELDS:
                value = getattr(req, key)
                if value is not None:
                    setattr(emp, key, value)
        req.status, req.review_note = decision, note
        req.reviewed_by_employee_id, req.reviewed_at = reviewer_id, datetime.now(timezone.utc)
        log_action(self.db, self.company_id, reviewer_id, f"bank_details.{decision}", "bank_detail_request",
                   req.id, {"title": emp.full_name})
        _notify(self.db, self.company_id, req.employee_id, reviewer_id, f"bank_details_{decision}",
                "Bank / PAN details updated" if decision == "approved" else "Bank / PAN change rejected",
                "HR approved your new details. Your next payslip will use them." if decision == "approved"
                else f"HR rejected your change: {note}",
                "bank_detail_request", req.id, "/profile")
        self.db.commit()
        self.db.refresh(req)
        return self._request_dict(req, full_account=True)

    @staticmethod
    def proof_content(req: BankDetailRequest) -> bytes:
        if not req.proof_storage_path:
            raise LookupError("No proof was attached")
        return document_storage.load(req.proof_storage_path)
