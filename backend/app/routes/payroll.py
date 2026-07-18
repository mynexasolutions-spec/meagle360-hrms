"""Payroll routes — salary components/structures, employee assignments,
payroll runs, and self-service payslips.

Admin-only by default; an Admin can additionally grant the "Payroll
Manager" role to another user (see /api/employees/{id}/roles) to share
access without touching that person's primary role.
"""

from uuid import UUID
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.services.payroll_service import PayrollService
from app.schemas.payroll import (
    SalaryComponentCreate, SalaryComponentUpdate, SalaryComponentResponse,
    SalaryStructureCreate, SalaryStructureUpdate, SalaryStructureResponse,
    EmployeeSalaryAssignmentCreate, EmployeeSalaryAssignmentResponse,
    PayslipAdjustmentCreate, PayslipResponse,
    PayrollRunCreate, PayrollRunResponse,
)

router = APIRouter(prefix="/api/payroll", tags=["Payroll"])


def _structure_to_response(structure) -> SalaryStructureResponse:
    components = [link.component for link in structure.component_links if link.component]
    components.sort(key=lambda c: (c.component_type, c.display_order))
    return SalaryStructureResponse(
        id=structure.id, company_id=structure.company_id, name=structure.name,
        description=structure.description, components=components,
    )


def _assignment_to_response(a) -> EmployeeSalaryAssignmentResponse:
    return EmployeeSalaryAssignmentResponse(
        id=a.id, employee_id=a.employee_id,
        employee_name=a.employee.full_name if getattr(a, "employee", None) else None,
        salary_structure_id=a.salary_structure_id,
        salary_structure_name=a.salary_structure.name if a.salary_structure else None,
        basic_pay=a.basic_pay, effective_from=a.effective_from, created_at=a.created_at,
    )


def _payslip_to_response(p) -> PayslipResponse:
    run = getattr(p, "payroll_run", None)
    return PayslipResponse(
        id=p.id, payroll_run_id=p.payroll_run_id, employee_id=p.employee_id,
        employee_name=p.employee.full_name if getattr(p, "employee", None) else None,
        employee_code=p.employee.employee_code if getattr(p, "employee", None) else None,
        basic_pay=p.basic_pay, gross_earnings=p.gross_earnings, gross_deductions=p.gross_deductions,
        working_days=p.working_days, lop_days=p.lop_days, lop_amount=p.lop_amount, net_pay=p.net_pay,
        lines=p.lines, run_year=run.year if run else None, run_month=run.month if run else None,
        run_status=run.status if run else None,
    )


# ── Salary Components ─────────────────────────────────────
@router.get("/components", response_model=list[SalaryComponentResponse])
def list_components(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:read")),
):
    return PayrollService(db, company_id).get_components()


@router.post("/components", response_model=SalaryComponentResponse, status_code=201)
def create_component(
    data: SalaryComponentCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    return PayrollService(db, company_id).create_component(data.model_dump())


@router.put("/components/{component_id}", response_model=SalaryComponentResponse)
def update_component(
    component_id: UUID, data: SalaryComponentUpdate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    component = PayrollService(db, company_id).update_component(component_id, data.model_dump(exclude_unset=True))
    if not component:
        raise HTTPException(status_code=404, detail="Salary component not found")
    return component


@router.delete("/components/{component_id}", status_code=204)
def delete_component(
    component_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    if not PayrollService(db, company_id).delete_component(component_id):
        raise HTTPException(status_code=404, detail="Salary component not found")


# ── Salary Structures ─────────────────────────────────────
@router.get("/structures", response_model=list[SalaryStructureResponse])
def list_structures(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:read")),
):
    return [_structure_to_response(s) for s in PayrollService(db, company_id).get_structures()]


@router.post("/structures", response_model=SalaryStructureResponse, status_code=201)
def create_structure(
    data: SalaryStructureCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    structure = PayrollService(db, company_id).create_structure(data.name, data.description, data.component_ids)
    return _structure_to_response(structure)


@router.put("/structures/{structure_id}", response_model=SalaryStructureResponse)
def update_structure(
    structure_id: UUID, data: SalaryStructureUpdate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    structure = PayrollService(db, company_id).update_structure(structure_id, data.model_dump(exclude_unset=True))
    if not structure:
        raise HTTPException(status_code=404, detail="Salary structure not found")
    return _structure_to_response(structure)


@router.delete("/structures/{structure_id}", status_code=204)
def delete_structure(
    structure_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    if not PayrollService(db, company_id).delete_structure(structure_id):
        raise HTTPException(status_code=404, detail="Salary structure not found")


# ── Employee Salary Assignments ───────────────────────────
@router.get("/assignments/{employee_id}", response_model=list[EmployeeSalaryAssignmentResponse])
def get_assignment_history(
    employee_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:read")),
):
    return [_assignment_to_response(a) for a in PayrollService(db, company_id).get_assignment_history(employee_id)]


@router.post("/assignments", response_model=EmployeeSalaryAssignmentResponse, status_code=201)
def assign_employee(
    data: EmployeeSalaryAssignmentCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    assignment = PayrollService(db, company_id).assign_employee(data.model_dump())
    return _assignment_to_response(assignment)


# ── Payroll Runs ───────────────────────────────────────────
@router.get("/runs", response_model=list[PayrollRunResponse])
def list_runs(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:read")),
):
    return PayrollService(db, company_id).get_runs()


@router.post("/runs", response_model=PayrollRunResponse, status_code=201)
def create_run(
    data: PayrollRunCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("payroll:write")),
):
    svc = PayrollService(db, company_id)
    try:
        run = svc.run_payroll(data.year, data.month, current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    payslips = svc.get_run_payslips(run.id)
    return PayrollRunResponse(
        id=run.id, company_id=run.company_id, year=run.year, month=run.month,
        status=run.status, finalized_at=run.finalized_at, created_at=run.created_at,
        payslip_count=len(payslips), total_net_pay=sum((p.net_pay for p in payslips), Decimal(0)),
    )


@router.get("/runs/{run_id}/payslips", response_model=list[PayslipResponse])
def get_run_payslips(
    run_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:read")),
):
    return [_payslip_to_response(p) for p in PayrollService(db, company_id).get_run_payslips(run_id)]


@router.post("/runs/{run_id}/finalize", response_model=PayrollRunResponse)
def finalize_run(
    run_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("payroll:approve")),
):
    svc = PayrollService(db, company_id)
    try:
        run = svc.finalize_run(run_id, current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    payslips = svc.get_run_payslips(run.id)
    return PayrollRunResponse(
        id=run.id, company_id=run.company_id, year=run.year, month=run.month,
        status=run.status, finalized_at=run.finalized_at, created_at=run.created_at,
        payslip_count=len(payslips), total_net_pay=sum((p.net_pay for p in payslips), Decimal(0)),
    )


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(
    run_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    svc = PayrollService(db, company_id)
    try:
        if not svc.delete_run(run_id):
            raise HTTPException(status_code=404, detail="Payroll run not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Adjustments ─────────────────────────────────────────────
@router.post("/payslips/{payslip_id}/adjustments", response_model=PayslipResponse)
def add_adjustment(
    payslip_id: UUID, data: PayslipAdjustmentCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("payroll:write")),
):
    svc = PayrollService(db, company_id)
    try:
        payslip = svc.add_adjustment(payslip_id, data.model_dump(), current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    return _payslip_to_response(payslip)


# ── Self-service ─────────────────────────────────────────────
@router.get("/my-payslips", response_model=list[PayslipResponse])
def my_payslips(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    payslips = PayrollService(db, company_id).get_my_payslips(current_user.employee_id)
    return [_payslip_to_response(p) for p in payslips]
