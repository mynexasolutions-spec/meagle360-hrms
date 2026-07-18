"""Employee routes — CRUD, directory, org chart, documents."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.services.employee_service import EmployeeService
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    EmployeeDocumentCreate,
    EmployeeDocumentResponse,
    EmployeeInviteRequest,
    EmployeeInviteResponse,
    EmployeeProfileResponse,
    EmployeeRolesUpdate,
)

router = APIRouter(prefix="/api/employees", tags=["Employees"])


@router.get("/", response_model=list[EmployeeResponse])
def list_employees(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    svc = EmployeeService(db, company_id)
    return svc.list_employees(skip, limit)


@router.get("/directory")
def get_directory(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    svc = EmployeeService(db, company_id)
    employees = svc.get_directory(skip, limit)
    return [svc.to_directory_dict(e) for e in employees]


@router.post("/invite", response_model=EmployeeInviteResponse, status_code=201)
def invite_employee(
    data: EmployeeInviteRequest,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("employees:write")),
):
    """Create a new employee with a login and an assigned role, returning an
    invite token for them to set their own password.

    In production the token would be emailed as a setup link; it's returned
    directly here since no email provider is wired up yet — same pattern as
    the platform's company-admin invite flow.
    """
    svc = EmployeeService(db, company_id)
    try:
        employee, user, invite_token = svc.invite_employee(data.model_dump(), current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return EmployeeInviteResponse(
        employee_id=employee.id,
        user_account_id=user.id,
        email=user.email,
        invite_token=invite_token,
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
        invite_token = svc.resend_invite(employee_id, current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return EmployeeInviteResponse(
        employee_id=emp.id,
        user_account_id=emp.user_account.id,
        email=emp.user_account.email,
        invite_token=invite_token,
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
):
    svc = EmployeeService(db, company_id)
    return svc.get_org_chart()


@router.get("/{employee_id}", response_model=EmployeeProfileResponse)
def get_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    svc = EmployeeService(db, company_id)
    emp = svc.get_employee(employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return svc.to_profile_dict(emp)


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
    emp = svc.update_employee(employee_id, data.model_dump(exclude_unset=True), current_user.employee_id)
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


@router.get("/{employee_id}/documents", response_model=list[EmployeeDocumentResponse])
def list_documents(
    employee_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    svc = EmployeeService(db, company_id)
    emp = svc.get_employee(employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp.documents


@router.post("/{employee_id}/documents", response_model=EmployeeDocumentResponse, status_code=201)
def add_document(
    employee_id: UUID,
    data: EmployeeDocumentCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    """Upload a document to an employee's file. An employee can upload to
    their own file (self-service, e.g. from the Documents page); uploading to
    someone else's file (e.g. Admin attaching an offer letter) requires
    employees:write."""
    is_self = current_user.employee_id == employee_id
    if not is_self and not current_user.merged_permissions.get("employees:write"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    svc = EmployeeService(db, company_id)
    emp = svc.get_employee(employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return svc.add_document(employee_id, data.model_dump())
