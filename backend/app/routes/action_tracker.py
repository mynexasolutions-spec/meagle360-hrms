"""Action Tracker routes — manage task assignments and status updates."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user
from app.models.user_account import UserAccount
from app.services.action_item_service import ActionItemService
from app.schemas.action_item import (
    ActionItemCreate,
    ActionItemUpdateStatus,
    ActionItemResponse,
)

router = APIRouter(prefix="/api/action-tracker", tags=["Action Tracker"])


@router.get("/", response_model=list[ActionItemResponse])
def list_action_items(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    from app.models.action_item import ActionItem
    ActionItem.__table__.create(bind=db.get_bind(), checkfirst=True)

    svc = ActionItemService(db, company_id)
    role_name = (current_user.role.name if current_user.role else "") or ""
    is_admin = any(r in role_name.lower() for r in ["admin", "hr manager"])
    return svc.get_action_items(employee_id=current_user.employee_id, is_admin=is_admin)


@router.post("/", response_model=ActionItemResponse, status_code=201)
def create_action_item(
    data: ActionItemCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    # Auto-create table if missing
    from app.models.action_item import ActionItem
    ActionItem.__table__.create(bind=db.get_bind(), checkfirst=True)

    # Check permission: Admin, Manager role, or any management permission
    role_name = (current_user.role.name if current_user.role else "") or ""
    is_admin_or_mgr_role = any(r in role_name.lower() for r in ["admin", "manager"])
    is_permission = bool(
        current_user.merged_permissions.get("attendance:approve") or 
        current_user.merged_permissions.get("leave:approve") or
        current_user.merged_permissions.get("employees:write") or
        current_user.merged_permissions.get("settings:write")
    )

    if not (is_admin_or_mgr_role or is_permission):
        raise HTTPException(status_code=403, detail="Only Admins and Managers can create action tracker items")

    svc = ActionItemService(db, company_id)
    return svc.create_action_item(created_by_id=current_user.employee_id, data=data.model_dump())


@router.patch("/{item_id}/status", response_model=ActionItemResponse)
def update_action_item_status(
    item_id: UUID,
    data: ActionItemUpdateStatus,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    svc = ActionItemService(db, company_id)
    updated = svc.update_status(item_id, status=data.status, note=data.completion_note)
    if not updated:
        raise HTTPException(status_code=404, detail="Action item not found")
    return updated


@router.delete("/{item_id}", status_code=204)
def delete_action_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    is_admin = current_user.role.name == "Admin" if current_user.role else False
    is_manager = bool(current_user.merged_permissions.get("attendance:approve") or current_user.merged_permissions.get("leave:approve"))

    if not (is_admin or is_manager):
        raise HTTPException(status_code=403, detail="Only Admins and Managers can delete action tracker items")

    svc = ActionItemService(db, company_id)
    if not svc.delete_action_item(item_id):
        raise HTTPException(status_code=404, detail="Action item not found")
