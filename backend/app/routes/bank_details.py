"""PAN / bank details: the employee asks, HR approves."""

import logging
from contextlib import contextmanager
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, has_any_permission, require_any_permission
from app.models.user_account import UserAccount
from app.routes.required_document import document_errors, file_response
from app.services.bank_details_service import BankDetailService, IfscUnavailable, RequestConflict, lookup_ifsc
from app.services.required_document_service import MAX_FILE_BYTES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bank-details", tags=["Bank details"])

REVIEW_PERMISSIONS = ("employees:write", "settings:write", "payroll:write")
reviewer = require_any_permission(REVIEW_PERMISSIONS)


def service(db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id)) -> BankDetailService:
    return BankDetailService(db, company_id)


@contextmanager
def errors():
    with document_errors():
        try:
            yield
        except RequestConflict as e:
            raise HTTPException(status_code=409, detail=str(e))
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e))


def _me(user: UserAccount) -> UUID:
    if not user.employee_id:
        raise HTTPException(status_code=400, detail="Your login is not linked to an employee.")
    return user.employee_id


# ── Employee ─────────────────────────────────────────────
@router.get("/me")
def my_details(svc: BankDetailService = Depends(service), user: UserAccount = Depends(get_current_user)):
    with errors():
        return svc.my_details(_me(user))


@router.post("/me/requests", status_code=201)
def submit(
    pan_number: str | None = Form(None, max_length=20),
    bank_account_number: str | None = Form(None, max_length=40),
    bank_ifsc: str | None = Form(None, max_length=20),
    bank_name: str | None = Form(None, max_length=150),
    proof: UploadFile | None = File(None),
    svc: BankDetailService = Depends(service),
    user: UserAccount = Depends(get_current_user),
):
    """Multipart. Fields left empty are not changed. Proof is optional (PDF/JPG/PNG, 2 MB)."""
    content = proof.file.read(MAX_FILE_BYTES + 1) if proof and proof.filename else None
    data = {"pan_number": pan_number, "bank_account_number": bank_account_number,
            "bank_ifsc": bank_ifsc, "bank_name": bank_name}
    with errors():
        return svc.submit(_me(user), data, content, proof.filename if content else None)


@router.delete("/me/requests/{request_id}", status_code=204)
def cancel(request_id: UUID, svc: BankDetailService = Depends(service),
           user: UserAccount = Depends(get_current_user)):
    with errors():
        svc.cancel(_me(user), request_id)


@router.get("/ifsc/{code}")
def ifsc(code: str, _: UserAccount = Depends(get_current_user)):
    try:
        return lookup_ifsc(code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except IfscUnavailable as e:
        logger.warning("IFSC lookup failed: %s", e)
        raise HTTPException(status_code=502, detail="Bank lookup is not responding. Enter the bank name yourself.")


# ── HR ───────────────────────────────────────────────────
class ReviewBody(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=500)


@router.get("/requests")
def list_requests(status: Literal["pending", "approved", "rejected", "cancelled", "all"] = "pending",
                  svc: BankDetailService = Depends(service), _: UserAccount = Depends(reviewer)):
    return svc.list(None if status == "all" else status)


@router.post("/requests/{request_id}/review")
def review(request_id: UUID, body: ReviewBody, svc: BankDetailService = Depends(service),
           user: UserAccount = Depends(reviewer)):
    with errors():
        return svc.review(request_id, user.employee_id, body.decision, body.note)


@router.get("/requests/{request_id}/proof")
def proof(request_id: UUID, svc: BankDetailService = Depends(service),
          user: UserAccount = Depends(get_current_user)):
    with errors():
        req = svc.get(request_id)
        if req.employee_id != user.employee_id and not has_any_permission(user, REVIEW_PERMISSIONS):
            raise LookupError("Request not found")
        content = svc.proof_content(req)
    return file_response(content, req.proof_content_type, req.proof_filename or "proof")
