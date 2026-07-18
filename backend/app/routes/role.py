"""Role routes — read-only listing for populating role pickers (e.g. Invite Employee)."""

from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, require_permissions
from app.models.role import Role
from app.schemas.role import RoleResponse

router = APIRouter(prefix="/api/roles", tags=["Roles"])


@router.get("/", response_model=list[RoleResponse])
def list_roles(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("employees:read")),
):
    return (
        db.query(Role)
        .filter(Role.company_id == company_id)
        .order_by(Role.name.asc())
        .all()
    )
