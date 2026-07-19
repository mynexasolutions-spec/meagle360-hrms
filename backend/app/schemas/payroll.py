"""Pydantic schemas for Payroll Management."""

from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel


class SalaryComponentCreate(BaseModel):
    name: str
    component_type: str  # earning | deduction
    calculation_type: str  # fixed | percent_of_basic | percent_of_gross
    value: Decimal
    is_statutory: bool = False
    is_taxable: bool = True
    display_order: int = 0
    is_employer_contribution: bool = False
    is_balancing_figure: bool = False
    statutory_type: str | None = None  # epf | esi | pt | tds


class SalaryComponentUpdate(BaseModel):
    name: str | None = None
    component_type: str | None = None
    calculation_type: str | None = None
    value: Decimal | None = None
    is_statutory: bool | None = None
    is_taxable: bool | None = None
    is_active: bool | None = None
    display_order: int | None = None
    is_employer_contribution: bool | None = None
    is_balancing_figure: bool | None = None
    statutory_type: str | None = None


class SalaryComponentResponse(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    component_type: str
    calculation_type: str
    value: Decimal
    is_statutory: bool
    is_taxable: bool
    is_active: bool
    display_order: int
    is_employer_contribution: bool
    is_balancing_figure: bool
    statutory_type: str | None

    class Config:
        from_attributes = True


class SalaryStructureCreate(BaseModel):
    name: str
    description: str | None = None
    component_ids: list[UUID] = []


class SalaryStructureUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    component_ids: list[UUID] | None = None


class SalaryStructureResponse(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    description: str | None
    components: list[SalaryComponentResponse] = []

    class Config:
        from_attributes = True


class EmployeeSalaryAssignmentCreate(BaseModel):
    employee_id: UUID
    salary_structure_id: UUID | None = None
    annual_ctc: Decimal | None = None
    basic_pay: Decimal
    effective_from: date


class EmployeeSalaryAssignmentResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: str | None = None
    salary_structure_id: UUID | None
    salary_structure_name: str | None = None
    annual_ctc: Decimal | None = None
    basic_pay: Decimal
    effective_from: date
    created_at: datetime

    class Config:
        from_attributes = True


class PayslipLineResponse(BaseModel):
    id: UUID
    component_name: str
    component_type: str
    amount: Decimal
    is_manual_adjustment: bool
    description: str | None

    class Config:
        from_attributes = True


class PayslipAdjustmentCreate(BaseModel):
    component_name: str
    component_type: str  # earning | deduction
    amount: Decimal
    description: str | None = None


class PayslipResponse(BaseModel):
    id: UUID
    payroll_run_id: UUID
    employee_id: UUID
    employee_name: str | None = None
    employee_code: str | None = None
    basic_pay: Decimal
    gross_earnings: Decimal
    gross_deductions: Decimal
    working_days: Decimal
    lop_days: Decimal
    lop_amount: Decimal
    net_pay: Decimal
    lines: list[PayslipLineResponse] = []
    run_year: int | None = None
    run_month: int | None = None
    run_status: str | None = None

    class Config:
        from_attributes = True


class PayrollRunCreate(BaseModel):
    year: int
    month: int


class PayrollRunResponse(BaseModel):
    id: UUID
    company_id: UUID
    year: int
    month: int
    status: str
    finalized_at: datetime | None
    created_at: datetime
    payslip_count: int = 0
    total_net_pay: Decimal = Decimal("0")

    class Config:
        from_attributes = True


class WeeklyOffUpdate(BaseModel):
    weekly_off_days: list[int]  # 0=Monday ... 6=Sunday


class PayrollPolicyUpdate(BaseModel):
    min_basic_percent_of_ctc: Decimal | None = None
    epf_threshold_employee_count: int | None = None
    esi_threshold_employee_count: int | None = None
    esi_wage_ceiling: Decimal | None = None
    gratuity_threshold_employee_count: int | None = None
    gratuity_years_regular: Decimal | None = None
    gratuity_years_fixed_term: Decimal | None = None
    fnf_settlement_days: int | None = None
    standard_working_hours_per_day: Decimal | None = None
    overtime_rate_multiplier: Decimal | None = None
    tds_cess_percent: Decimal | None = None


class PayrollPolicyResponse(BaseModel):
    min_basic_percent_of_ctc: Decimal
    epf_threshold_employee_count: int
    esi_threshold_employee_count: int
    esi_wage_ceiling: Decimal
    gratuity_threshold_employee_count: int
    gratuity_years_regular: Decimal
    gratuity_years_fixed_term: Decimal
    fnf_settlement_days: int
    standard_working_hours_per_day: Decimal
    overtime_rate_multiplier: Decimal
    tds_cess_percent: Decimal
    epf_registered: bool

    class Config:
        from_attributes = True


class TaxSlabCreate(BaseModel):
    regime: str  # old | new
    min_income: Decimal
    max_income: Decimal | None = None
    rate_percent: Decimal


class TaxSlabUpdate(BaseModel):
    regime: str | None = None
    min_income: Decimal | None = None
    max_income: Decimal | None = None
    rate_percent: Decimal | None = None


class TaxSlabResponse(BaseModel):
    id: UUID
    company_id: UUID
    regime: str
    min_income: Decimal
    max_income: Decimal | None
    rate_percent: Decimal

    class Config:
        from_attributes = True


class ProfessionalTaxSlabCreate(BaseModel):
    state: str
    min_gross: Decimal
    max_gross: Decimal | None = None
    amount: Decimal


class ProfessionalTaxSlabUpdate(BaseModel):
    state: str | None = None
    min_gross: Decimal | None = None
    max_gross: Decimal | None = None
    amount: Decimal | None = None


class ProfessionalTaxSlabResponse(BaseModel):
    id: UUID
    company_id: UUID
    state: str
    min_gross: Decimal
    max_gross: Decimal | None
    amount: Decimal

    class Config:
        from_attributes = True


class EmployeeLoanCreate(BaseModel):
    employee_id: UUID
    principal_amount: Decimal
    monthly_installment: Decimal
    start_date: date
    reason: str | None = None


class EmployeeLoanResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: str | None = None
    principal_amount: Decimal
    monthly_installment: Decimal
    remaining_balance: Decimal
    start_date: date
    status: str
    reason: str | None

    class Config:
        from_attributes = True


class GratuityStatusResponse(BaseModel):
    eligible: bool
    headcount_met: bool
    years_required: Decimal
    years_of_service: Decimal
    estimated_amount: Decimal


class FnfInitiateRequest(BaseModel):
    exit_date: date
    exit_reason: str | None = None


class FnfSettlementResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: str | None = None
    exit_date: date
    pending_salary_amount: Decimal
    leave_encashment_days: Decimal
    leave_encashment_amount: Decimal
    gratuity_eligible: bool
    gratuity_amount: Decimal
    outstanding_deductions: Decimal
    net_payable: Decimal
    status: str
    processed_at: datetime | None

    class Config:
        from_attributes = True
