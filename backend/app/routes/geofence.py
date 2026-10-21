"""Geofence routes - settings, office locations, employee location requests
and review of flagged clock-ins."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.services.geofence_service import GeofenceService

router = APIRouter(prefix="/api/geofence", tags=["Geofence"])


class OfficeIn(BaseModel):
    name: str
    latitude: float
    longitude: float
    radius_m: int | None = None


class OfficeUpdate(BaseModel):
    name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    radius_m: int | None = None


class ConfigUpdate(BaseModel):
    enabled: bool | None = None
    mode: str | None = None  # block | flag
    office: OfficeIn | None = None  # first office, saved together with enabling


class LocationRequestIn(BaseModel):
    name: str
    latitude: float
    longitude: float
    radius_m: int | None = None


class ReviewIn(BaseModel):
    approve: bool
    radius_m: int | None = None
    note: str | None = None


def _require_reviewer(current_user: UserAccount = Depends(get_current_user)) -> UserAccount:
    """Admin and HR Manager can approve location requests / flagged clock-ins."""
    if not any(r.name in ("Admin", "HR Manager") for r in current_user.all_roles):
        raise HTTPException(status_code=403, detail="Only Admin or HR can do this")
    return current_user


def _run(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── settings ──────────────────────────────────────────────────────────
@router.get("/config")
def get_config(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    return GeofenceService(db, company_id).get_config(current_user.employee_id)


@router.put("/config")
def update_config(
    data: ConfigUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("settings:write")),
):
    svc = GeofenceService(db, company_id)
    return _run(svc.update_config, current_user.employee_id, data.enabled, data.mode,
                data.office.model_dump() if data.office else None)


# ── offices ───────────────────────────────────────────────────────────
@router.post("/offices")
def create_office(
    data: OfficeIn,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("settings:write")),
):
    return _run(GeofenceService(db, company_id).create_office, current_user.employee_id, data.model_dump())


@router.put("/offices/{office_id}")
def update_office(
    office_id: UUID,
    data: OfficeUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("settings:write")),
):
    return _run(GeofenceService(db, company_id).update_office, current_user.employee_id,
                office_id, data.model_dump(exclude_unset=True))


@router.delete("/offices/{office_id}")
def delete_office(
    office_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("settings:write")),
):
    _run(GeofenceService(db, company_id).delete_office, current_user.employee_id, office_id)
    return {"ok": True}


# ── employee location requests ────────────────────────────────────────
@router.get("/my-locations")
def my_locations(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    return GeofenceService(db, company_id).list_employee_requests(employee_id=current_user.employee_id)


@router.post("/my-locations")
def request_location(
    data: LocationRequestIn,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    return _run(GeofenceService(db, company_id).create_request, current_user.employee_id,
                data.name, data.latitude, data.longitude, data.radius_m)


@router.delete("/my-locations/{request_id}")
def remove_my_location(
    request_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    _run(GeofenceService(db, company_id).withdraw_request, current_user.employee_id, request_id)
    return {"ok": True}


@router.get("/location-requests")
def list_location_requests(
    status: str | None = Query(None, pattern="^(pending|approved|rejected|revoked)$"),
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(_require_reviewer),
):
    return GeofenceService(db, company_id).list_employee_requests(status=status)


@router.post("/location-requests/{request_id}/review")
def review_location_request(
    request_id: UUID,
    data: ReviewIn,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(_require_reviewer),
):
    return _run(GeofenceService(db, company_id).review_request, current_user.employee_id,
                request_id, data.approve, data.radius_m, data.note)


# ── flagged clock-ins ─────────────────────────────────────────────────
@router.get("/flagged")
def list_flagged(
    status: str | None = Query("pending", pattern="^(pending|approved|rejected)$"),
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(_require_reviewer),
):
    return GeofenceService(db, company_id).list_flagged(status)


@router.post("/flagged/{record_id}/review")
def review_flagged(
    record_id: UUID,
    data: ReviewIn,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(_require_reviewer),
):
    return _run(GeofenceService(db, company_id).review_flagged, current_user.employee_id,
                record_id, data.approve, data.note)
