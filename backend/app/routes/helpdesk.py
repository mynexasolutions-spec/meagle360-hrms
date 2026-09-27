"""Helpdesk routes — employee self-service + Manager/Admin handling.

Reply/staff-list access is hardcoded to the Manager and Admin role names
(not permission-flag based) — see require_manager_or_admin below.
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user
from app.models.user_account import UserAccount
from app.services.helpdesk_service import HelpdeskService
from app.schemas.helpdesk import (
    TicketCreate, TicketStatusUpdate, ReplyCreate,
    TicketEmployeeOut, TicketStaffOut,
    TicketReplyEmployeeOut, TicketReplyStaffOut,
)

router = APIRouter(prefix="/api/helpdesk", tags=["Helpdesk"])


def require_manager_or_admin():
    """Hardcoded to role name, deliberately not the seeded 'Helpdesk Manager'
    permission role — Manager and Admin only (decided explicitly, see
    project notes)."""
    def _check(current_user: UserAccount = Depends(get_current_user)):
        if not any(r.name in ("Manager", "Admin") for r in current_user.all_roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager or Admin only")
        return current_user
    return _check


def _current_role_label(current_user: UserAccount) -> str:
    role_names = {r.name for r in current_user.all_roles}
    if "Admin" in role_names:
        return "admin"
    if "Manager" in role_names:
        return "manager"
    return "employee"


def _employee_out(t) -> TicketEmployeeOut:
    return TicketEmployeeOut(
        id=t.id, employee_id=t.employee_id, category=t.category, subject=t.subject,
        description=t.description, status=t.status, created_at=t.created_at, closed_at=t.closed_at,
        replies=[
            TicketReplyEmployeeOut(
                id=r.id,
                message=r.message,
                created_at=r.created_at,
                author_role=r.author_role,
                author_name="Support Team" if r.author_role in ("admin", "manager") else (r.author.full_name if r.author else "Employee"),
            ) for r in t.replies
        ],
    )


def _staff_out(t) -> TicketStaffOut:
    return TicketStaffOut(
        id=t.id, employee_id=t.employee_id,
        employee_name=t.employee.full_name if t.employee else None,
        category=t.category, subject=t.subject, description=t.description,
        status=t.status, created_at=t.created_at, closed_at=t.closed_at,
        replies=[
            TicketReplyStaffOut(
                id=r.id, message=r.message, created_at=r.created_at,
                author_employee_id=r.author_employee_id,
                author_name=r.author.full_name if r.author else None,
                author_role=r.author_role,
            ) for r in t.replies
        ],
    )


# ── Employee self-service ─────────────────────────────────
@router.post("/tickets", response_model=TicketEmployeeOut, status_code=201)
def create_ticket(
    data: TicketCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    if not current_user.employee_id:
        raise HTTPException(status_code=400, detail="No employee record linked to this account")
    ticket = HelpdeskService(db, company_id).create_ticket(current_user.employee_id, data.model_dump())
    return _employee_out(ticket)


@router.get("/my-tickets", response_model=list[TicketEmployeeOut])
def my_tickets(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    tickets = HelpdeskService(db, company_id).get_my_tickets(current_user.employee_id)
    return [_employee_out(t) for t in tickets]


@router.post("/my-tickets/{ticket_id}/replies", response_model=TicketEmployeeOut)
def reply_as_employee(
    ticket_id: UUID, data: ReplyCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    svc = HelpdeskService(db, company_id)
    ticket = svc.get_ticket(ticket_id)
    if not ticket or ticket.employee_id != current_user.employee_id:
        raise HTTPException(status_code=404, detail="Ticket not found")
    updated = svc.add_reply(ticket_id, current_user.employee_id, "employee", data.message)
    return _employee_out(updated)


# ── Manager / Admin ────────────────────────────────────────
@router.get("/tickets", response_model=list[TicketStaffOut])
def list_tickets(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_manager_or_admin()),
):
    svc = HelpdeskService(db, company_id)
    role_names = {r.name for r in current_user.all_roles}
    tickets = svc.get_all_tickets() if "Admin" in role_names else svc.get_tickets_for_manager(current_user.employee_id)
    return [_staff_out(t) for t in tickets]


@router.get("/tickets/{ticket_id}", response_model=TicketStaffOut)
def get_ticket(
    ticket_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_manager_or_admin()),
):
    svc = HelpdeskService(db, company_id)
    ticket = svc.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    role_names = {r.name for r in current_user.all_roles}
    if "Admin" not in role_names and not svc.manager_can_view(current_user.employee_id, ticket):
        raise HTTPException(status_code=403, detail="Not your direct report's ticket")
    return _staff_out(ticket)


@router.post("/tickets/{ticket_id}/replies", response_model=TicketStaffOut)
def reply_as_staff(
    ticket_id: UUID, data: ReplyCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_manager_or_admin()),
):
    svc = HelpdeskService(db, company_id)
    ticket = svc.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    role_names = {r.name for r in current_user.all_roles}
    if "Admin" not in role_names and not svc.manager_can_view(current_user.employee_id, ticket):
        raise HTTPException(status_code=403, detail="Not your direct report's ticket")
    role_label = _current_role_label(current_user)
    updated = svc.add_reply(ticket_id, current_user.employee_id, role_label, data.message)
    return _staff_out(updated)


@router.put("/tickets/{ticket_id}/status", response_model=TicketStaffOut)
def update_status(
    ticket_id: UUID, data: TicketStatusUpdate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_manager_or_admin()),
):
    svc = HelpdeskService(db, company_id)
    ticket = svc.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    role_names = {r.name for r in current_user.all_roles}
    if "Admin" not in role_names and not svc.manager_can_view(current_user.employee_id, ticket):
        raise HTTPException(status_code=403, detail="Not your direct report's ticket")
    updated = svc.update_status(ticket_id, data.status, current_user.employee_id)
    return _staff_out(updated)