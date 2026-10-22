"""Face routes - selfie verification settings, reference photo upload/approval
and review of flagged clock-ins."""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.services.face_service import FaceService

router = APIRouter(prefix="/api/face", tags=["Face Verification"])


class ConfigUpdate(BaseModel):
    enabled: bool


class ReviewIn(BaseModel):
    approve: bool
    note: str | None = None


def _require_reviewer(current_user: UserAccount = Depends(get_current_user)) -> UserAccount:
    """Admin and HR Manager can approve photos / flagged clock-ins."""
    if not any(r.name in ("Admin", "HR Manager") for r in current_user.all_roles):
        raise HTTPException(status_code=403, detail="Only Admin or HR can do this")
    return current_user


def _run(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/config")
def get_config(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    return FaceService(db, company_id).get_config(current_user.employee_id)


@router.put("/config")
def update_config(
    data: ConfigUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("settings:write")),
):
    return FaceService(db, company_id).update_config(current_user.employee_id, data.enabled)


@router.post("/profile")
async def upload_photo(
    photo: UploadFile = File(...),
    consent: bool = Form(False),
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    raw = await photo.read()
    return _run(FaceService(db, company_id).upload_photo, current_user.employee_id, raw, consent)


@router.get("/profile/me/photo")
def my_photo(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    url = _run(FaceService(db, company_id).get_photo_url, current_user.employee_id)
    return RedirectResponse(url=url)


@router.delete("/profile/me")
def delete_my_profile(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    return FaceService(db, company_id).delete_profile(current_user.employee_id)


@router.get("/profiles")
def list_profiles(
    status: str | None = Query("pending"),
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(_require_reviewer),
):
    return FaceService(db, company_id).list_profiles(status)


@router.get("/profiles/{profile_id}/photo")
def profile_photo(
    profile_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(_require_reviewer),
):
    url = _run(FaceService(db, company_id).get_photo_url_by_profile, profile_id)
    return RedirectResponse(url=url)


@router.post("/profiles/{profile_id}/review")
def review_profile(
    profile_id: UUID,
    data: ReviewIn,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    reviewer: UserAccount = Depends(_require_reviewer),
):
    return _run(FaceService(db, company_id).review_profile, reviewer.employee_id,
                profile_id, data.approve, data.note)


@router.get("/flagged")
def list_flagged(
    status: str | None = Query("pending"),
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(_require_reviewer),
):
    return FaceService(db, company_id).list_flagged(status)


@router.post("/flagged/{record_id}/review")
def review_flagged(
    record_id: UUID,
    data: ReviewIn,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    reviewer: UserAccount = Depends(_require_reviewer),
):
    return _run(FaceService(db, company_id).review_flagged, reviewer.employee_id,
                record_id, data.approve, data.note)
