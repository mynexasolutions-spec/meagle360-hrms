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


class SalaryComponentUpdate(BaseModel):
    name: str | None = None
    component_type: str | None = None
    calculation_type: str | None = None
    value: Decimal | None = None
    is_statutory: bool | None = None
    is_taxable: bool | None = None
    is_active: bool | None = None
    display_order: int | None = None


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
    basic_pay: Decimal
    effective_from: date


class EmployeeSalaryAssignmentResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: str | None = None
    salary_structure_id: UUID | None
    salary_structure_name: str | None = None
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
