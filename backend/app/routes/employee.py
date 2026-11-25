"""Employee routes — CRUD, directory, org chart, documents."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import (
    DIRECTORY_PERMISSIONS,
    get_company_id,
    get_current_user,
    has_any_permission,
    require_any_permission,
    require_permissions,
)
from app.models.user_account import UserAccount
from app.services.employee_service import EmployeeService
from app.services.team_service import TeamService
from app.services import document_service
from app.repositories.offer_letter_repo import OfferLetterRepository
from app.repositories.relieving_letter_repo import RelievingLetterRepository
from app.schemas.offer_letter import OfferLetterCreate
from app.schemas.relieving_letter import RelievingLetterCreate
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    EmployeeInviteRequest,
    EmployeeInviteResponse,
    EmployeeProfileResponse,
    EmployeeRolesUpdate,
)

router = APIRouter(prefix="/api/employees", tags=["Employees"])

# Personal, bank and tax details. People with directory access may see a work
# profile, but these need HR or payroll permissions.
_PRIVATE_FIELDS = (
    "personal_email", "phone", "date_of_birth", "gender", "address",
    "emergency_contact_name", "emergency_contact_phone", "exit_reason",
    "pan_number", "uan_number", "bank_account_number", "bank_ifsc", "bank_name",
    "esi_number", "esi_registered_date", "epf_applicable", "esi_applicable", "tax_regime",
)


def _can_view_private(user: UserAccount, employee_id: UUID) -> bool:
    perms = user.merged_permissions
    return user.employee_id == employee_id or any(
        perms.get(p) for p in ("employees:write", "settings:write", "payroll:read")
    )


def _redact(payload: dict) -> dict:
    return {
        **payload,
        **{f: None for f in _PRIVATE_FIELDS if f in payload},
        "declared_investments": 0,
    }


@router.get("/", response_model=list[EmployeeResponse])
def list_employees(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_any_permission(DIRECTORY_PERMISSIONS)),
):
    svc = EmployeeService(db, company_id)
    return [
        e if _can_view_private(current_user, e.id)
        else _redact(EmployeeResponse.model_validate(e).model_dump())
        for e in svc.list_employees(skip, limit)
    ]


@router.get("/directory")
def get_directory(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_any_permission(DIRECTORY_PERMISSIONS)),
):
    svc = EmployeeService(db, company_id)
    employees = svc.get_directory(skip, limit)
    return [svc.to_directory_dict(e) for e in employees]


@router.get("/my-team")
def get_my_team(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    """The caller's manager, people with the same manager, and direct reports."""
    return TeamService(db, company_id).get_team(current_user.employee_id)


@router.get("/colleagues")
def find_colleagues(
    q: str = Query(min_length=2, max_length=80),
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(get_current_user),
):
    """Look someone up by name or department: work contact details only."""
    return TeamService(db, company_id).find_colleagues(q.strip())


@router.post("/invite", response_model=EmployeeInviteResponse, status_code=201)
def invite_employee(
    data: EmployeeInviteRequest,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("employees:write")),
):
    """Create a new employee with a login and an assigned role, and email them
    a setup link. The invite token is still returned in the response as a
    fallback to share manually if the email fails to send.
    """
    svc = EmployeeService(db, company_id)
    try:
        employee, user, invite_token, email_sent = svc.invite_employee(data.model_dump(), current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return EmployeeInviteResponse(
        employee_id=employee.id,
        user_account_id=user.id,
        email=user.email,
        invite_token=invite_token,
        email_sent=email_sent,
    )


@router.post("/{employee_id}/resend-invite", response_model=EmployeeInviteResponse)
def resend_invite(
    employee_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("employees:write")),
):
    """Regenerate an invite token for an employee whose account is still pending."""
    svc = EmployeeService(db, company_id)
    emp = svc.get_employee(employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    try:
        invite_token, email_sent = svc.resend_invite(employee_id, current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return EmployeeInviteResponse(
        employee_id=emp.id,
        user_account_id=emp.user_account.id,
        email=emp.user_account.email,
        invite_token=invite_token,
        email_sent=email_sent,
    )


@router.put("/{employee_id}/roles", response_model=EmployeeProfileResponse)
def update_employee_roles(
    employee_id: UUID,
    data: EmployeeRolesUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("settings:write")),
):
    """Grant/revoke additional roles on top of an employee's primary role
    (e.g. adding Payroll Manager) — Admin-only (gated on settings:write,
    which today only the Admin role has)."""
    svc = EmployeeService(db, company_id)
    try:
        svc.set_additional_roles(employee_id, data.additional_role_ids, current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    emp = svc.get_employee(employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return svc.to_profile_dict(emp)


@router.get("/org-chart")
def get_org_chart(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_any_permission(DIRECTORY_PERMISSIONS)),
):
    svc = EmployeeService(db, company_id)
    return svc.get_org_chart()


@router.get("/{employee_id}", response_model=EmployeeProfileResponse)
def get_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    can_view_private = _can_view_private(current_user, employee_id)
    if not can_view_private and not has_any_permission(current_user, DIRECTORY_PERMISSIONS):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    svc = EmployeeService(db, company_id)
    emp = svc.get_employee(employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    profile = svc.to_profile_dict(emp)
    return profile if can_view_private else _redact(profile)


@router.post("/", response_model=EmployeeResponse, status_code=201)
def create_employee(
    data: EmployeeCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("employees:write")),
):
    svc = EmployeeService(db, company_id)
    return svc.create_employee(data.model_dump(), current_user.employee_id)


@router.put("/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("employees:write")),
):
    svc = EmployeeService(db, company_id)
    try:
        emp = svc.update_employee(employee_id, data.model_dump(exclude_unset=True), current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


@router.delete("/{employee_id}", status_code=204)
def delete_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("employees:write")),
):
    svc = EmployeeService(db, company_id)
    if not svc.delete_employee(employee_id, current_user.employee_id):
        raise HTTPException(status_code=404, detail="Employee not found")


# ── Offer Letter ─────────────────────────────────────────────
@router.post("/offer-letters", status_code=201)
def create_offer_letter(
    data: OfferLetterCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("employees:write")),
):
    repo = OfferLetterRepository(db, company_id)
    payload = data.model_dump()
    payload["generated_by_employee_id"] = current_user.employee_id
    record = repo.create(payload)
    return {"id": record.id}


@router.get("/offer-letters/{offer_id}/pdf")
def download_offer_letter_pdf(
    offer_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("employees:write")),
):
    pdf_bytes = document_service.generate_offer_letter_pdf(db, company_id, offer_id)
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="Offer letter record not found")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=offer_letter_{offer_id}.pdf"},
    )


# ── Relieving Letter ─────────────────────────────────────────
@router.post("/relieving-letters", status_code=201)
def create_relieving_letter(
    data: RelievingLetterCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("employees:write")),
):
    repo = RelievingLetterRepository(db, company_id)
    payload = data.model_dump()
    payload["generated_by_employee_id"] = current_user.employee_id
    record = repo.create(payload)
    return {"id": record.id}


@router.get("/relieving-letters/{relieving_id}/pdf")
def download_relieving_letter_pdf(
    relieving_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("employees:write")),
):
    pdf_bytes = document_service.generate_relieving_letter_pdf(db, company_id, relieving_id)
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="Relieving letter record not found")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=relieving_letter_{relieving_id}.pdf"},
    )
