"""Payroll routes — salary components/structures, employee assignments,
payroll runs, and self-service payslips.

Admin-only by default; an Admin can additionally grant the "Payroll
Manager" role to another user (see /api/employees/{id}/roles) to share
access without touching that person's primary role.
"""

from uuid import UUID
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.services.payroll_service import PayrollService
from app.services import document_service
from app.schemas.payroll import (
    SalaryComponentCreate, SalaryComponentUpdate, SalaryComponentResponse,
    SalaryStructureCreate, SalaryStructureUpdate, SalaryStructureResponse,
    EmployeeSalaryAssignmentCreate, EmployeeSalaryAssignmentResponse,
    PayslipAdjustmentCreate, PayslipResponse,
    PayrollRunCreate, PayrollRunResponse,
    PayrollPolicyUpdate, PayrollPolicyResponse,
    TaxSlabCreate, TaxSlabUpdate, TaxSlabResponse,
    ProfessionalTaxSlabCreate, ProfessionalTaxSlabUpdate, ProfessionalTaxSlabResponse,
    EmployeeLoanCreate, EmployeeLoanResponse,
    GratuityStatusResponse, FnfInitiateRequest, FnfSettlementResponse,
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
        annual_ctc=a.annual_ctc,
        basic_pay=a.basic_pay, effective_from=a.effective_from, created_at=a.created_at,
    )


def _loan_to_response(loan) -> EmployeeLoanResponse:
    return EmployeeLoanResponse(
        id=loan.id, employee_id=loan.employee_id,
        employee_name=loan.employee.full_name if getattr(loan, "employee", None) else None,
        principal_amount=loan.principal_amount, monthly_installment=loan.monthly_installment,
        remaining_balance=loan.remaining_balance, start_date=loan.start_date,
        status=loan.status, reason=loan.reason,
    )


def _fnf_to_response(f) -> FnfSettlementResponse:
    return FnfSettlementResponse(
        id=f.id, employee_id=f.employee_id,
        employee_name=f.employee.full_name if getattr(f, "employee", None) else None,
        exit_date=f.exit_date, pending_salary_amount=f.pending_salary_amount,
        leave_encashment_days=f.leave_encashment_days, leave_encashment_amount=f.leave_encashment_amount,
        gratuity_eligible=f.gratuity_eligible, gratuity_amount=f.gratuity_amount,
        outstanding_deductions=f.outstanding_deductions, net_payable=f.net_payable,
        status=f.status, processed_at=f.processed_at,
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
        run_status=run.status if run else None, payslip_number=p.payslip_number,
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
    try:
        assignment = PayrollService(db, company_id).assign_employee(data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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


# ── Payroll Policy (thresholds, floors, rates — all admin-configurable) ──
@router.get("/policy", response_model=PayrollPolicyResponse)
def get_payroll_policy(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:read")),
):
    from app.models.company import Company
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.put("/policy", response_model=PayrollPolicyResponse)
def update_payroll_policy(
    data: PayrollPolicyUpdate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    from app.models.company import Company
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


# ── Tax Slabs ──────────────────────────────────────────────
@router.get("/tax-slabs", response_model=list[TaxSlabResponse])
def list_tax_slabs(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:read")),
):
    return PayrollService(db, company_id).get_tax_slabs()


@router.post("/tax-slabs", response_model=TaxSlabResponse, status_code=201)
def create_tax_slab(
    data: TaxSlabCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    return PayrollService(db, company_id).create_tax_slab(data.model_dump())


@router.put("/tax-slabs/{slab_id}", response_model=TaxSlabResponse)
def update_tax_slab(
    slab_id: UUID, data: TaxSlabUpdate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    slab = PayrollService(db, company_id).update_tax_slab(slab_id, data.model_dump(exclude_unset=True))
    if not slab:
        raise HTTPException(status_code=404, detail="Tax slab not found")
    return slab


@router.delete("/tax-slabs/{slab_id}", status_code=204)
def delete_tax_slab(
    slab_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    if not PayrollService(db, company_id).delete_tax_slab(slab_id):
        raise HTTPException(status_code=404, detail="Tax slab not found")


# ── Professional Tax Slabs ─────────────────────────────────
@router.get("/pt-slabs", response_model=list[ProfessionalTaxSlabResponse])
def list_pt_slabs(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:read")),
):
    return PayrollService(db, company_id).get_pt_slabs()


@router.post("/pt-slabs", response_model=ProfessionalTaxSlabResponse, status_code=201)
def create_pt_slab(
    data: ProfessionalTaxSlabCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    return PayrollService(db, company_id).create_pt_slab(data.model_dump())


@router.put("/pt-slabs/{slab_id}", response_model=ProfessionalTaxSlabResponse)
def update_pt_slab(
    slab_id: UUID, data: ProfessionalTaxSlabUpdate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    slab = PayrollService(db, company_id).update_pt_slab(slab_id, data.model_dump(exclude_unset=True))
    if not slab:
        raise HTTPException(status_code=404, detail="PT slab not found")
    return slab


@router.delete("/pt-slabs/{slab_id}", status_code=204)
def delete_pt_slab(
    slab_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    if not PayrollService(db, company_id).delete_pt_slab(slab_id):
        raise HTTPException(status_code=404, detail="PT slab not found")


# ── Employee Loans ─────────────────────────────────────────
@router.get("/loans/{employee_id}", response_model=list[EmployeeLoanResponse])
def list_loans(
    employee_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:read")),
):
    return [_loan_to_response(l) for l in PayrollService(db, company_id).get_loans_for_employee(employee_id)]


@router.post("/loans", response_model=EmployeeLoanResponse, status_code=201)
def create_loan(
    data: EmployeeLoanCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    loan = PayrollService(db, company_id).create_loan(data.model_dump())
    return _loan_to_response(loan)


@router.post("/loans/{loan_id}/close", response_model=EmployeeLoanResponse)
def close_loan(
    loan_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:write")),
):
    loan = PayrollService(db, company_id).close_loan(loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    return _loan_to_response(loan)


# ── Gratuity ───────────────────────────────────────────────
@router.get("/gratuity/{employee_id}", response_model=GratuityStatusResponse)
def gratuity_status(
    employee_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:read")),
):
    try:
        return PayrollService(db, company_id).get_gratuity_status(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Full & Final Settlement ────────────────────────────────
@router.get("/fnf", response_model=list[FnfSettlementResponse])
def list_fnf(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:read")),
):
    return [_fnf_to_response(f) for f in PayrollService(db, company_id).get_all_fnf()]


@router.get("/fnf/{employee_id}", response_model=FnfSettlementResponse | None)
def get_fnf_for_employee(
    employee_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("payroll:read")),
):
    settlement = PayrollService(db, company_id).get_fnf_for_employee(employee_id)
    return _fnf_to_response(settlement) if settlement else None


@router.post("/fnf/{employee_id}/initiate", response_model=FnfSettlementResponse, status_code=201)
def initiate_fnf(
    employee_id: UUID, data: FnfInitiateRequest,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("payroll:write")),
):
    svc = PayrollService(db, company_id)
    try:
        settlement = svc.initiate_fnf(employee_id, data.exit_date, data.exit_reason, current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _fnf_to_response(settlement)


@router.post("/fnf/{settlement_id}/process", response_model=FnfSettlementResponse)
def process_fnf(
    settlement_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("payroll:approve")),
):
    svc = PayrollService(db, company_id)
    try:
        settlement = svc.process_fnf(settlement_id, current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    return _fnf_to_response(settlement)


# ── Document Generation ─────────────────────────────────────
@router.get("/payslips/{payslip_id}/pdf")
def download_payslip_pdf(
    payslip_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    from app.models.payslip import Payslip
    payslip = db.query(Payslip).filter(Payslip.id == payslip_id, Payslip.company_id == company_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    user_roles = [r.name for r in current_user.roles]
    is_owner = current_user.employee_id is not None and current_user.employee_id == payslip.employee_id
    is_admin_or_hr = any(r in ("SUPER_ADMIN", "ADMIN", "HR_MANAGER") for r in user_roles)
    if not (is_owner or is_admin_or_hr):
        raise HTTPException(status_code=403, detail="Not authorized to download this payslip")

    pdf_bytes = document_service.generate_payslip_pdf(db, company_id, payslip_id)
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="Payslip document could not be generated")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=payslip_{payslip_id}.pdf"},
    )
