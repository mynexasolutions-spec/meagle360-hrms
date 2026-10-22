"""Selfie verification service - reference photo profiles, clock-in face
matching and admin review of flagged entries.

Privacy: the live clock-in selfie is decoded in memory, matched, and thrown
away. Only the match result (status/score/reason) is saved on the record.
Passport reference photos are stored in Cloudinary per employee."""

import base64
import binascii
from datetime import datetime, timezone
from io import BytesIO
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.attendance_record import AttendanceRecord
from app.models.company import Company
from app.models.employee import Employee
from app.models.face_profile import EmployeeFaceProfile
from app.services import face_engine
from app.services.audit_service import log_action
from app.services.cloudinary_service import delete_face_reference_photo, upload_face_reference_photo
from app.services.geofence_service import GeofenceService, _notify

MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_SELFIE_BYTES = 3 * 1024 * 1024
PHOTO_MAX_SIDE = 480


def _normalise_photo(raw: bytes) -> bytes:
    """Downscale to a small JPEG so upload to Cloudinary and face processing is fast."""
    from PIL import Image, UnidentifiedImageError
    try:
        img = Image.open(BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise ValueError("Please upload a valid image (JPG or PNG).")
    img = img.convert("RGB")
    img.thumbnail((PHOTO_MAX_SIDE, PHOTO_MAX_SIDE))
    out = BytesIO()
    img.save(out, format="JPEG", quality=85)
    return out.getvalue()


def _decode_selfie(selfie: str) -> bytes:
    if "," in selfie[:100]:  # strip a data-URL prefix
        selfie = selfie.split(",", 1)[1]
    try:
        raw = base64.b64decode(selfie, validate=False)
    except (binascii.Error, ValueError):
        raise face_engine.FaceError("The selfie could not be read.")
    if not raw or len(raw) > MAX_SELFIE_BYTES:
        raise face_engine.FaceError("The selfie is empty or too large.")
    return raw


class FaceService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    # -- settings -----------------------------------------------------------
    def _company(self) -> Company:
        return self.db.query(Company).filter(Company.id == self.company_id).first()

    def is_enabled(self) -> bool:
        company = self._company()
        return bool(company and company.face_verification_enabled)

    def _profile(self, employee_id: UUID) -> EmployeeFaceProfile | None:
        return (self.db.query(EmployeeFaceProfile)
                .filter(EmployeeFaceProfile.company_id == self.company_id,
                        EmployeeFaceProfile.employee_id == employee_id).first())

    def get_config(self, employee_id: UUID | None = None) -> dict:
        cfg = {"enabled": self.is_enabled(), "threshold": get_settings().FACE_MATCH_THRESHOLD}
        if employee_id:
            p = self._profile(employee_id)
            cfg["my_profile"] = self._profile_dict(p) if p else None
        return cfg

    def update_config(self, actor_id: UUID | None, enabled: bool) -> dict:
        company = self._company()
        changed = company.face_verification_enabled != enabled
        company.face_verification_enabled = enabled
        if changed:
            log_action(self.db, self.company_id, actor_id,
                       "face_verification_enabled" if enabled else "face_verification_disabled",
                       "company", self.company_id, {})
        self.db.commit()
        return self.get_config()

    # -- reference photo ----------------------------------------------------
    @staticmethod
    def _profile_dict(p: EmployeeFaceProfile) -> dict:
        return {"id": p.id, "employee_id": p.employee_id,
                "employee_name": p.employee.full_name if p.employee else None,
                "photo_url": p.photo_url,
                "status": p.status, "review_note": p.review_note,
                "reviewed_at": p.reviewed_at, "created_at": p.created_at,
                "updated_at": p.updated_at}

    def upload_photo(self, employee_id: UUID, raw: bytes, consent: bool) -> dict:
        if not self.is_enabled():
            raise ValueError("Selfie verification is not enabled for your company.")
        if not consent:
            raise ValueError("You must consent to the use of your photo for attendance verification.")
        if not raw or len(raw) > MAX_PHOTO_BYTES:
            raise ValueError("Photo is empty or larger than 5 MB.")
        photo = _normalise_photo(raw)
        try:
            embedding = face_engine.extract_embedding(photo)
        except face_engine.FaceEngineUnavailable:
            raise ValueError("Face verification engine is temporarily unavailable. Please try again later.")
        except face_engine.FaceError as fe:
            raise ValueError(str(fe))

        # Upload reference photo to Cloudinary (overwrites existing for this employee)
        try:
            photo_url = upload_face_reference_photo(photo, str(self.company_id), str(employee_id))
        except Exception as e:
            raise ValueError(f"Could not upload photo: {e}")

        now = datetime.now(timezone.utc)
        p = self._profile(employee_id)
        if p:
            p.photo_url, p.embedding, p.consent_at = photo_url, embedding, now
            p.status, p.reviewed_by, p.reviewed_at, p.review_note = "pending", None, None, None
        else:
            p = EmployeeFaceProfile(company_id=self.company_id, employee_id=employee_id,
                                    photo_url=photo_url, embedding=embedding, consent_at=now)
            self.db.add(p)
        self.db.flush()
        emp = self.db.query(Employee).filter(Employee.id == employee_id).first()
        for admin_id in GeofenceService(self.db, self.company_id)._reviewer_ids():
            _notify(self.db, self.company_id, admin_id, employee_id, "face_photo_submitted",
                    "Passport photo awaiting approval",
                    f"{emp.full_name if emp else 'An employee'} submitted a photo for selfie verification.",
                    "employee_face_profile", p.id, "/settings")
        self.db.commit()
        self.db.refresh(p)
        return self._profile_dict(p)

    def get_photo_url(self, employee_id: UUID) -> str:
        p = self._profile(employee_id)
        if not p:
            raise ValueError("No photo found.")
        return p.photo_url

    def get_photo_url_by_profile(self, profile_id: UUID) -> str:
        p = (self.db.query(EmployeeFaceProfile)
             .filter(EmployeeFaceProfile.id == profile_id,
                     EmployeeFaceProfile.company_id == self.company_id).first())
        if not p:
            raise ValueError("No photo found.")
        return p.photo_url

    def list_profiles(self, status: str | None = "pending") -> list[dict]:
        q = self.db.query(EmployeeFaceProfile).filter(EmployeeFaceProfile.company_id == self.company_id)
        if status:
            q = q.filter(EmployeeFaceProfile.status == status)
        return [self._profile_dict(p) for p in q.order_by(EmployeeFaceProfile.updated_at.desc()).all()]

    def review_profile(self, reviewer_id: UUID | None, profile_id: UUID, approve: bool,
                       note: str | None) -> dict:
        p = (self.db.query(EmployeeFaceProfile)
             .filter(EmployeeFaceProfile.id == profile_id,
                     EmployeeFaceProfile.company_id == self.company_id).first())
        if not p:
            raise ValueError("Photo not found.")
        if p.status != "pending":
            raise ValueError("This photo has already been reviewed.")
        p.status = "approved" if approve else "rejected"
        p.reviewed_by, p.reviewed_at, p.review_note = reviewer_id, datetime.now(timezone.utc), note or None
        log_action(self.db, self.company_id, reviewer_id,
                   "face_photo_approved" if approve else "face_photo_rejected",
                   "employee_face_profile", p.id, {"employee_id": str(p.employee_id)})
        msg = ("Your photo was approved. Clock-in will now ask for a live selfie." if approve
               else "Your photo was rejected. Please upload a clearer passport-size photo.")
        if note:
            msg += f" Note: {note}"
        _notify(self.db, self.company_id, p.employee_id, reviewer_id, "face_photo_reviewed",
                f"Photo {'approved' if approve else 'rejected'}", msg,
                "employee_face_profile", p.id, "/attendance")
        self.db.commit()
        return self._profile_dict(p)

    def delete_profile(self, employee_id: UUID) -> dict:
        """Allows an employee to deactivate selfie verification for themselves
        and remove their registered passport/reference photo."""
        p = self._profile(employee_id)
        if not p:
            return {"deleted": False, "message": "No photo profile found."}

        try:
            delete_face_reference_photo(str(self.company_id), str(employee_id))
        except Exception:
            pass

        self.db.delete(p)

        # Mark any active open clock-in session as unverified immediately
        open_rec = (
            self.db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.employee_id == employee_id,
                AttendanceRecord.clock_out.is_(None),
            )
            .first()
        )
        if open_rec:
            open_rec.face_status = "unverified"
            open_rec.face_score = None
            open_rec.face_flag_reason = None
            open_rec.face_review_status = None

        log_action(self.db, self.company_id, employee_id, "face_profile_deactivated",
                   "employee_face_profile", p.id, {"employee_id": str(employee_id)})
        self.db.commit()
        return {"deleted": True, "message": "Selfie verification deactivated and photo removed."}

    # -- clock-in -----------------------------------------------------------
    def evaluate_clock_in(self, employee_id: UUID, selfie: str | None,
                          liveness_passed: bool) -> dict | None:
        """None when the feature is off. Otherwise attendance-record fields.
        Never blocks a clock-in because of a mismatch - that is flagged for
        review. Raises ValueError only when a selfie is required but missing."""
        if not self.is_enabled():
            return None
        profile = self._profile(employee_id)
        if not profile or profile.status != "approved":
            return {"face_status": "unverified"}
        if not selfie:
            raise ValueError("A live selfie is required to clock in. Please allow camera access.")

        def flagged(reason: str, score: float | None = None) -> dict:
            return {"face_status": "flagged", "face_score": score,
                    "face_flag_reason": reason, "face_review_status": "pending"}

        if not liveness_passed:
            return flagged("liveness_failed")
        try:
            emb = face_engine.extract_embedding(_decode_selfie(selfie))
        except face_engine.FaceEngineUnavailable:
            return flagged("engine_error")
        except face_engine.FaceError:
            return flagged("no_face")
        score = round(face_engine.cosine_similarity(emb, profile.embedding), 4)
        if score >= get_settings().FACE_MATCH_THRESHOLD:
            return {"face_status": "verified", "face_score": score}
        return flagged("mismatch", score)

    # -- flagged review -----------------------------------------------------
    def notify_flagged(self, employee_id: UUID, record: AttendanceRecord) -> None:
        emp = self.db.query(Employee).filter(Employee.id == employee_id).first()
        for admin_id in GeofenceService(self.db, self.company_id)._reviewer_ids():
            _notify(self.db, self.company_id, admin_id, employee_id, "face_flagged_attendance",
                    "Clock-in flagged for face check",
                    f"{emp.full_name if emp else 'An employee'}'s clock-in selfie did not match.",
                    "attendance_record", record.id, "/settings")

    def list_flagged(self, status: str | None = "pending", limit: int = 200) -> list[dict]:
        q = (self.db.query(AttendanceRecord)
             .filter(AttendanceRecord.company_id == self.company_id,
                     AttendanceRecord.face_review_status.isnot(None)))
        if status:
            q = q.filter(AttendanceRecord.face_review_status == status)
        return [{
            "id": r.id, "employee_id": r.employee_id,
            "employee_name": r.employee.full_name if r.employee else None,
            "clock_in": r.clock_in, "clock_out": r.clock_out,
            "face_score": r.face_score, "reason": r.face_flag_reason,
            "geofence_status": r.geofence_status, "source": r.source,
            "review_status": r.face_review_status, "review_note": r.face_review_note,
            "reviewed_at": r.face_reviewed_at,
        } for r in q.order_by(AttendanceRecord.clock_in.desc()).limit(limit).all()]

    def review_flagged(self, reviewer_id: UUID | None, record_id: UUID, approve: bool,
                       note: str | None) -> dict:
        rec = (self.db.query(AttendanceRecord)
               .filter(AttendanceRecord.id == record_id,
                       AttendanceRecord.company_id == self.company_id).first())
        if not rec or rec.face_review_status is None:
            raise ValueError("Flagged attendance record not found.")
        if rec.face_review_status != "pending":
            raise ValueError("This record has already been reviewed.")
        rec.face_review_status = "approved" if approve else "rejected"
        rec.face_reviewed_by = reviewer_id
        rec.face_reviewed_at = datetime.now(timezone.utc)
        rec.face_review_note = note or None
        log_action(self.db, self.company_id, reviewer_id,
                   "face_flag_approved" if approve else "face_flag_rejected",
                   "attendance_record", rec.id,
                   {"employee_id": str(rec.employee_id), "score": rec.face_score,
                    "reason": rec.face_flag_reason})
        msg = ("Your flagged clock-in was approved." if approve else
               "Your flagged clock-in was rejected and will not be counted. "
               "You can submit an attendance regularization request.")
        if note:
            msg += f" Note: {note}"
        _notify(self.db, self.company_id, rec.employee_id, reviewer_id, "face_attendance_reviewed",
                f"Flagged clock-in {'approved' if approve else 'rejected'}", msg,
                "attendance_record", rec.id, "/attendance")
        self.db.commit()
        return {"id": rec.id, "review_status": rec.face_review_status}
