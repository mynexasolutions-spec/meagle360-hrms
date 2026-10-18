"""PMS routes — Phase 1: configuration (config, parameters, slabs).

Writes and sensitive reads (config weights, hike slabs) are Admin-only.
The competency parameter list is readable by any authenticated user since
raters need it to fill in reviews.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_admin_role
from app.models.user_account import UserAccount
from app.schemas.pms import (
    ParameterCreate, ParameterOut, ParameterUpdate,
    PmsConfigOut, PmsConfigUpdate, SlabCreate, SlabOut,
)
from app.services.pms_config_service import PmsConfigError, PmsConfigService

router = APIRouter(prefix="/api/pms", tags=["PMS"])


def _call(fn, *args, **kwargs):
    """Translate service-layer errors to HTTP errors."""
    try:
        return fn(*args, **kwargs)
    except PmsConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Config ───────────────────────────────────────────────────
@router.get("/config", response_model=PmsConfigOut)
def get_config(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_admin_role()),
):
    return PmsConfigService(db, company_id).get_config()


@router.put("/config", response_model=PmsConfigOut)
def update_config(
    data: PmsConfigUpdate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    svc = PmsConfigService(db, company_id)
    return _call(svc.update_config, current_user.employee_id, data.model_dump(exclude_unset=True))


# ── Competency parameters ────────────────────────────────────
@router.get("/parameters", response_model=list[ParameterOut])
def list_parameters(
    include_inactive: bool = False,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    # Only admins may see deactivated parameters.
    if include_inactive and not any(r.name == "Admin" for r in current_user.all_roles):
        include_inactive = False
    return PmsConfigService(db, company_id).list_parameters(include_inactive)


@router.post("/parameters", response_model=ParameterOut, status_code=201)
def create_parameter(
    data: ParameterCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    return _call(PmsConfigService(db, company_id).create_parameter,
                 current_user.employee_id, data.model_dump())


@router.put("/parameters/{parameter_id}", response_model=ParameterOut)
def update_parameter(
    parameter_id: UUID, data: ParameterUpdate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    return _call(PmsConfigService(db, company_id).update_parameter,
                 current_user.employee_id, parameter_id, data.model_dump(exclude_unset=True))


# ── Rating slabs ─────────────────────────────────────────────
@router.get("/slabs", response_model=list[SlabOut])
def list_slabs(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_admin_role()),
):
    return PmsConfigService(db, company_id).list_slabs()


@router.post("/slabs", response_model=SlabOut, status_code=201)
def create_slab(
    data: SlabCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    return _call(PmsConfigService(db, company_id).create_slab,
                 current_user.employee_id, data.model_dump())


@router.put("/slabs/{slab_id}", response_model=SlabOut)
def update_slab(
    slab_id: UUID, data: SlabCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    return _call(PmsConfigService(db, company_id).update_slab,
                 current_user.employee_id, slab_id, data.model_dump())


@router.delete("/slabs/{slab_id}", status_code=204)
def delete_slab(
    slab_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    _call(PmsConfigService(db, company_id).delete_slab, current_user.employee_id, slab_id)
