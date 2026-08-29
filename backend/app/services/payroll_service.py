"""Payroll service — salary structures, employee assignments, payroll runs,
and the full statutory calculation engine.

Every rate/threshold used below (Basic-% floor, EPF/ESI headcount
thresholds, ESI wage ceiling, gratuity years, overtime multiplier, tax
slabs, PT slabs) is read from Company/SalaryComponent/TaxSlab/
ProfessionalTaxSlab rows — nothing is hardcoded. Admin can change any of
it at any time; existing finalized payslips are frozen snapshots and are
never retroactively affected.

LOP reuses the same data sources as the attendance "Employee Records" view
(attendance sessions, approved leave + LeaveType.is_paid, company holidays,
Company.weekly_off_days) so payroll deductions stay consistent with what
Admin/Manager already see on the Attendance page.
"""

import calendar
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.employee import Employee
from app.models.holiday_calendar import HolidayCalendar
from app.models.overtime_request import OvertimeRequest
from app.models.expense_claim import ExpenseClaim
from app.models.salary_structure import SalaryStructure
from app.models.salary_structure_component import SalaryStructureComponent
from app.models.employee_salary_assignment import EmployeeSalaryAssignment
from app.models.payroll_run import PayrollRun
from app.models.payslip import Payslip
from app.models.payslip_line import PayslipLine
from app.models.employee_loan import EmployeeLoan
from app.models.fnf_settlement import FnfSettlement
from app.repositories.payroll_repo import (
    SalaryComponentRepository,
    SalaryStructureRepository,
    EmployeeSalaryAssignmentRepository,
    PayrollRunRepository,
    PayslipRepository,
    TaxSlabRepository,
    ProfessionalTaxSlabRepository,
    EmployeeLoanRepository,
    FnfSettlementRepository,
)
from app.repositories.attendance_repo import AttendanceRepository
from app.repositories.leave_repo import LeaveRequestRepository
from app.services.audit_service import log_action


class PayrollService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id
        self.component_repo = SalaryComponentRepository(db, company_id)
        self.structure_repo = SalaryStructureRepository(db, company_id)
        self.assignment_repo = EmployeeSalaryAssignmentRepository(db, company_id)
        self.run_repo = PayrollRunRepository(db, company_id)
        self.payslip_repo = PayslipRepository(db, company_id)
        self.tax_slab_repo = TaxSlabRepository(db, company_id)
        self.pt_slab_repo = ProfessionalTaxSlabRepository(db, company_id)
        self.loan_repo = EmployeeLoanRepository(db, company_id)
        self.fnf_repo = FnfSettlementRepository(db, company_id)

    def _get_company(self) -> Company:
        return self.db.query(Company).filter(Company.id == self.company_id).first()

    # ── Salary Components ─────────────────────────────────
    def get_components(self):
        return self.component_repo.get_all()

    def create_component(self, data: dict):
        return self.component_repo.create(data)

    def update_component(self, component_id: UUID, data: dict):
        return self.component_repo.update(component_id, data)

    def delete_component(self, component_id: UUID) -> bool:
        return self.component_repo.delete(component_id)

    # ── Salary Structures ─────────────────────────────────
    def get_structures(self):
        return self.structure_repo.get_all_with_components()

    def get_structure(self, structure_id: UUID):
        return self.structure_repo.get_with_components(structure_id)

    def create_structure(self, name: str, description: str | None, component_ids: list[UUID]):
        structure = SalaryStructure(
            id=uuid.uuid4(), company_id=self.company_id, name=name, description=description,
        )
        self.db.add(structure)
        self.db.flush()
        self._set_structure_components(structure.id, component_ids)
        self.db.commit()
        return self.structure_repo.get_with_components(structure.id)

    def update_structure(self, structure_id: UUID, data: dict):
        structure = self.structure_repo.get_by_id(structure_id)
        if not structure:
            return None
        if data.get("name") is not None:
            structure.name = data["name"]
        if "description" in data:
            structure.description = data["description"]
        if data.get("component_ids") is not None:
            self._set_structure_components(structure_id, data["component_ids"])
        self.db.commit()
        return self.structure_repo.get_with_components(structure_id)

    def delete_structure(self, structure_id: UUID) -> bool:
        return self.structure_repo.delete(structure_id)

    def _set_structure_components(self, structure_id: UUID, component_ids: list[UUID]):
        self.db.query(SalaryStructureComponent).filter(
            SalaryStructureComponent.salary_structure_id == structure_id
        ).delete()
        for component_id in component_ids:
            self.db.add(SalaryStructureComponent(
                id=uuid.uuid4(), salary_structure_id=structure_id, salary_component_id=component_id,
            ))
        self.db.flush()

    # ── Tax Slabs ──────────────────────────────────────────
    def get_tax_slabs(self):
        return self.tax_slab_repo.get_all()

    def create_tax_slab(self, data: dict):
        return self.tax_slab_repo.create(data)

    def update_tax_slab(self, slab_id: UUID, data: dict):
        return self.tax_slab_repo.update(slab_id, data)

    def delete_tax_slab(self, slab_id: UUID) -> bool:
        return self.tax_slab_repo.delete(slab_id)

    # ── Professional Tax Slabs ─────────────────────────────
    def get_pt_slabs(self):
        return self.pt_slab_repo.get_all()

    def create_pt_slab(self, data: dict):
        return self.pt_slab_repo.create(data)

    def update_pt_slab(self, slab_id: UUID, data: dict):
        return self.pt_slab_repo.update(slab_id, data)

    def delete_pt_slab(self, slab_id: UUID) -> bool:
        return self.pt_slab_repo.delete(slab_id)

    # ── Employee Loans ─────────────────────────────────────
    def get_loans_for_employee(self, employee_id: UUID):
        return self.loan_repo.get_by_employee(employee_id)

    def create_loan(self, data: dict):
        loan = EmployeeLoan(
            id=uuid.uuid4(), company_id=self.company_id,
            employee_id=data["employee_id"], principal_amount=data["principal_amount"],
            monthly_installment=data["monthly_installment"], remaining_balance=data["principal_amount"],
            start_date=data["start_date"], reason=data.get("reason"), status="active",
        )
        self.db.add(loan)
        self.db.commit()
        self.db.refresh(loan)
        return loan

    def close_loan(self, loan_id: UUID) -> EmployeeLoan | None:
        loan = self.loan_repo.get_by_id(loan_id)
        if not loan:
            return None
        loan.status = "closed"
        loan.remaining_balance = Decimal(0)
        self.db.commit()
        self.db.refresh(loan)
        return loan

    # ── Employee Salary Assignments ───────────────────────
    def assign_employee(self, data: dict) -> EmployeeSalaryAssignment:
        assignment = EmployeeSalaryAssignment(
            id=uuid.uuid4(), company_id=self.company_id,
            employee_id=data["employee_id"],
            salary_structure_id=data.get("salary_structure_id"),
            annual_ctc=data.get("annual_ctc"),
            basic_pay=data["basic_pay"],
            effective_from=data["effective_from"],
        )

        if assignment.annual_ctc:
            company = self._get_company()
            monthly_ctc = assignment.annual_ctc / 12
            min_basic = monthly_ctc * company.min_basic_percent_of_ctc / Decimal(100)
            if assignment.basic_pay < min_basic:
                raise ValueError(
                    f"Basic Pay (₹{assignment.basic_pay}) is below the configured floor of "
                    f"{company.min_basic_percent_of_ctc}% of monthly CTC (₹{round(min_basic, 2)}). "
                    f"Increase Basic Pay, or adjust the floor in Settings → Payroll Policy."
                )

        self.db.add(assignment)
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

    def get_current_assignment(self, employee_id: UUID):
        return self.assignment_repo.get_current_for_employee(employee_id)

    def get_assignment_history(self, employee_id: UUID):
        return self.assignment_repo.get_history_for_employee(employee_id)

    # ── LOP (loss-of-pay) calculation ─────────────────────
    def _get_month_lop_summary(self, employee_id: UUID, year: int, month: int) -> tuple[int, Decimal]:
        """Walks every day of the month and classifies it as working/off,
        returning (working_days, lop_days). An *approved* leave request
        governs the day outright — its leave type's paid/unpaid flag decides
        LOP, and any attendance clock-in/out that date is ignored entirely
        (an employee accidentally clocking in on an approved-leave day
        shouldn't turn an unpaid leave day into a paid one, or vice versa).
        Only on days with no approved leave does attendance presence decide
        LOP."""
        company = self._get_company()
        weekly_off = set((company.weekly_off_days if company else None) or [5, 6])

        _, last_day = calendar.monthrange(year, month)
        start = date(year, month, 1)
        end = date(year, month, last_day)

        holidays = {
            h.holiday_date for h in self.db.query(HolidayCalendar).filter(
                HolidayCalendar.company_id == self.company_id,
                HolidayCalendar.holiday_date >= start,
                HolidayCalendar.holiday_date <= end,
            ).all()
        }

        # Company operates in IST; clock_in is stored in UTC, so a 4 AM IST
        # clock-in must land on the IST calendar day, not the UTC one — same
        # convention as attendance_service._local_date.
        ist_offset = timedelta(hours=5, minutes=30)
        records = AttendanceRepository(self.db, self.company_id).get_by_date_range(start, end, employee_id)
        present_dates = set()
        for rec in records:
            d = (rec.clock_in + ist_offset).date() if isinstance(rec.clock_in, datetime) else rec.clock_in
            present_dates.add(d)

        leave_requests = LeaveRequestRepository(self.db, self.company_id).get_by_employee_and_date_range(
            employee_id, start, end
        )
        leave_is_paid_by_date: dict[date, bool] = {}
        for lr in leave_requests:
            if lr.status != "approved":
                continue
            is_paid = lr.leave_type.is_paid if lr.leave_type else True
            d = max(lr.start_date, start)
            last = min(lr.end_date, end)
            while d <= last:
                leave_is_paid_by_date[d] = is_paid
                d += timedelta(days=1)

        working_days = 0
        lop_days = 0
        d = start
        while d <= end:
            if d in holidays or d.weekday() in weekly_off:
                d += timedelta(days=1)
                continue
            working_days += 1
            if d in leave_is_paid_by_date:
                if not leave_is_paid_by_date[d]:
                    lop_days += 1
            elif d not in present_dates:
                lop_days += 1
            d += timedelta(days=1)

        return working_days, lop_days

    # ── Statutory eligibility (headcount/ceiling/cycle-driven) ────────
    def _get_active_headcount(self) -> int:
        return (
            self.db.query(Employee)
            .filter(Employee.company_id == self.company_id, Employee.employment_status == "active")
            .count()
        )

    def _resolve_epf_eligibility(self, employee: Employee, company: Company) -> bool:
        if not company.epf_registered:
            if self._get_active_headcount() >= company.epf_threshold_employee_count:
                company.epf_registered = True
                self.db.add(company)
        if employee.epf_applicable is not None:
            return employee.epf_applicable
        return company.epf_registered

    @staticmethod
    def _esi_cycle_end(for_date: date) -> date:
        """India's ESI contribution cycles: Apr-Sep and Oct-Mar."""
        if 4 <= for_date.month <= 9:
            return date(for_date.year, 9, 30)
        if for_date.month >= 10:
            return date(for_date.year + 1, 3, 31)
        return date(for_date.year, 3, 31)

    def _resolve_esi_eligibility(self, employee: Employee, company: Company, gross: Decimal, run_date: date) -> bool:
        if employee.esi_applicable is False:
            return False
        if employee.esi_applicable is True:
            return True
        # Automatic mode: once covered, stay covered for the rest of the cycle.
        if employee.esi_coverage_cycle_end and employee.esi_coverage_cycle_end >= run_date:
            return True
        if self._get_active_headcount() < company.esi_threshold_employee_count:
            return False
        if gross > company.esi_wage_ceiling:
            return False
        employee.esi_coverage_cycle_end = self._esi_cycle_end(run_date)
        self.db.add(employee)
        return True

    def _resolve_employee_state(self, employee: Employee) -> str | None:
        return employee.site.state if employee.site else None

    def _lookup_pt_amount(self, employee: Employee, gross: Decimal) -> Decimal:
        state = self._resolve_employee_state(employee)
        if not state:
            return Decimal(0)
        for slab in self.pt_slab_repo.get_by_state(state):
            if gross >= slab.min_gross and (slab.max_gross is None or gross < slab.max_gross):
                return slab.amount
        return Decimal(0)

    def _compute_tds(self, employee: Employee, monthly_gross: Decimal, company: Company) -> Decimal:
        regime = employee.tax_regime or "new"
        annual_income = monthly_gross * 12
        taxable = annual_income
        if regime == "old":
            taxable = max(Decimal(0), annual_income - (employee.declared_investments or Decimal(0)))

        annual_tax = Decimal(0)
        for slab in self.tax_slab_repo.get_by_regime(regime):
            if taxable <= slab.min_income:
                continue
            upper = min(slab.max_income, taxable) if slab.max_income is not None else taxable
            if upper <= slab.min_income:
                continue
            annual_tax += (upper - slab.min_income) * slab.rate_percent / Decimal(100)

        annual_tax_with_cess = annual_tax * (1 + company.tds_cess_percent / Decimal(100))
        return round(annual_tax_with_cess / 12, 2)

    # ── Overtime / reimbursements / loans ──────────────────
    def _get_overtime_pay(self, employee_id: UUID, year: int, month: int, gross: Decimal, working_days: int, company: Company) -> tuple[Decimal, Decimal]:
        _, last_day = calendar.monthrange(year, month)
        start = date(year, month, 1)
        end = date(year, month, last_day)
        requests = (
            self.db.query(OvertimeRequest)
            .filter(
                OvertimeRequest.company_id == self.company_id,
                OvertimeRequest.employee_id == employee_id,
                OvertimeRequest.status == "approved",
                OvertimeRequest.request_date >= start,
                OvertimeRequest.request_date <= end,
            )
            .all()
        )
        total_hours = sum((r.hours for r in requests), Decimal(0))
        if total_hours <= 0 or working_days <= 0:
            return Decimal(0), Decimal(0)
        hourly_rate = gross / (Decimal(working_days) * company.standard_working_hours_per_day)
        pay = round(hourly_rate * total_hours * company.overtime_rate_multiplier, 2)
        return pay, total_hours

    def _get_reimbursable_expenses(self, employee_id: UUID):
        return (
            self.db.query(ExpenseClaim)
            .filter(
                ExpenseClaim.company_id == self.company_id,
                ExpenseClaim.employee_id == employee_id,
                ExpenseClaim.status == "reimbursed",
                ExpenseClaim.paid_via_payslip_id.is_(None),
            )
            .all()
        )

    def _get_loan_deduction_preview(self, employee_id: UUID) -> tuple[Decimal, list]:
        loans = self.loan_repo.get_active_for_employee(employee_id)
        total = Decimal(0)
        details = []
        for loan in loans:
            amount = min(loan.monthly_installment, loan.remaining_balance)
            if amount > 0:
                total += amount
                details.append((loan, amount))
        return total, details

    # ── Computation engine ────────────────────────────────
    def _compute_payslip_for_employee(self, employee: Employee, assignment: EmployeeSalaryAssignment, year: int, month: int, company: Company) -> dict:
        """Computes one employee's full payslip breakdown for the month.
        Returns a dict consumed by run_payroll() to persist Payslip + lines."""
        basic_pay = assignment.basic_pay
        monthly_ctc = (assignment.annual_ctc / 12) if assignment.annual_ctc else None

        if monthly_ctc is not None:
            min_basic_required = monthly_ctc * company.min_basic_percent_of_ctc / Decimal(100)
            if basic_pay < min_basic_required:
                raise ValueError(
                    f"{employee.full_name}: Basic Pay is below the configured {company.min_basic_percent_of_ctc}% "
                    f"of CTC floor (needs ≥ ₹{round(min_basic_required, 2)}/month). Fix their salary assignment first."
                )

        components = []
        if assignment.salary_structure_id:
            structure = self.structure_repo.get_with_components(assignment.salary_structure_id)
            if structure:
                components = [
                    link.component for link in structure.component_links
                    if link.component and link.component.is_active
                ]
        components.sort(key=lambda c: (c.component_type, c.display_order))

        epf_eligible = self._resolve_epf_eligibility(employee, company)

        def base_amount(c, off: Decimal) -> Decimal:
            if c.calculation_type == "percent_of_basic":
                return round(basic_pay * c.value / Decimal(100), 2)
            if c.calculation_type == "percent_of_gross":
                return round(off * c.value / Decimal(100), 2)
            return round(c.value, 2)

        employer_components = [c for c in components if c.is_employer_contribution]
        earning_components = [c for c in components if c.component_type == "earning" and not c.is_employer_contribution]
        deduction_components = [c for c in components if c.component_type == "deduction" and not c.is_employer_contribution]
        balancing_component = next((c for c in earning_components if c.is_balancing_figure), None)
        fixed_earning_components = [c for c in earning_components if c is not balancing_component]

        # Employer-side cost (never paid to the employee, part of CTC only).
        employer_lines = []
        employer_cost_total = Decimal(0)
        for c in employer_components:
            amount = Decimal(0) if (c.statutory_type == "epf" and not epf_eligible) else base_amount(c, basic_pay)
            employer_cost_total += amount
            if amount != 0:
                employer_lines.append((c.name, "employer_cost", amount))

        # Fixed/percent earnings (against Basic only — Gross isn't known yet).
        fixed_earning_total = Decimal(0)
        earning_lines = []
        for c in fixed_earning_components:
            amount = base_amount(c, basic_pay)
            fixed_earning_total += amount
            earning_lines.append((c.name, "earning", amount))

        # The balancing component absorbs whatever's left of CTC.
        balancing_amount = Decimal(0)
        if balancing_component:
            if monthly_ctc is not None:
                balancing_amount = max(
                    Decimal(0), monthly_ctc - basic_pay - employer_cost_total - fixed_earning_total
                )
            else:
                balancing_amount = base_amount(balancing_component, basic_pay)
            earning_lines.append((balancing_component.name, "earning", round(balancing_amount, 2)))

        structure_earnings_total = fixed_earning_total + balancing_amount
        gross = basic_pay + structure_earnings_total  # what's actually paid, before deductions

        # Overtime, reimbursements, loans.
        working_days, lop_days = self._get_month_lop_summary(employee.id, year, month)
        overtime_pay, overtime_hours = self._get_overtime_pay(employee.id, year, month, gross, working_days, company)
        reimbursable_claims = self._get_reimbursable_expenses(employee.id)
        reimbursement_total = sum((c.amount for c in reimbursable_claims), Decimal(0))
        loan_total, loan_details = self._get_loan_deduction_preview(employee.id)

        _, last_day = calendar.monthrange(year, month)
        per_day_rate = (gross / Decimal(working_days)) if working_days > 0 else ((gross / Decimal(last_day)) if last_day else Decimal(0))
        lop_amount = min(gross, round(per_day_rate * lop_days, 2))

        # Actual earned salary after LOP for prorating statutory deductions
        earned_ratio = (Decimal(working_days - lop_days) / Decimal(working_days)) if working_days > 0 else Decimal(1)
        earned_basic = max(Decimal(0), round(basic_pay * earned_ratio, 2))
        earned_gross = max(Decimal(0), gross - lop_amount)

        esi_eligible = self._resolve_esi_eligibility(employee, company, earned_gross, date(year, month, calendar.monthrange(year, month)[1]))

        deduction_lines = []
        deduction_total = Decimal(0)
        for c in deduction_components:
            if c.statutory_type == "epf":
                amount = base_amount(c, earned_basic) if epf_eligible else Decimal(0)
            elif c.statutory_type == "esi":
                amount = base_amount(c, earned_gross) if esi_eligible else Decimal(0)
            elif c.statutory_type == "pt":
                amount = self._lookup_pt_amount(employee, earned_gross)
            elif c.statutory_type == "tds":
                amount = self._compute_tds(employee, earned_gross, company)
            else:
                amount = base_amount(c, earned_gross)
            if amount != 0:
                deduction_lines.append((c.name, "deduction", amount))
            deduction_total += amount

        total_earnings = basic_pay + structure_earnings_total + overtime_pay + reimbursement_total
        total_deductions = deduction_total + loan_total + lop_amount
        net_pay = max(Decimal(0), total_earnings - total_deductions)

        extra_lines = [("Basic Pay", "earning", basic_pay)] + list(earning_lines)
        if overtime_pay > 0:
            extra_lines.append((f"Overtime Pay ({overtime_hours}h)", "earning", overtime_pay))
        for claim in reimbursable_claims:
            extra_lines.append((f"Expense Reimbursement ({claim.description or claim.id})", "earning", claim.amount))
        extra_lines += deduction_lines
        for loan, amount in loan_details:
            extra_lines.append((f"Loan Repayment ({loan.reason or loan.id})", "deduction", amount))
        if lop_days > 0:
            extra_lines.append((
                f"Loss of Pay ({lop_days} day{'s' if lop_days != 1 else ''})", "deduction", lop_amount,
            ))

        return {
            "basic_pay": basic_pay,
            "gross_earnings": total_earnings,
            "gross_deductions": total_deductions,
            "working_days": working_days,
            "lop_days": lop_days,
            "lop_amount": lop_amount,
            "net_pay": net_pay,
            "employer_lines": employer_lines,
            "lines": extra_lines,
            "reimbursable_claim_ids": [c.id for c in reimbursable_claims],
            "loan_ids_and_amounts": [(loan.id, amount) for loan, amount in loan_details],
        }

    # ── Payroll Runs ───────────────────────────────────────
    def run_payroll(self, year: int, month: int, actor_employee_id: UUID | None) -> PayrollRun:
        if self.run_repo.get_by_year_month(year, month):
            raise ValueError(f"A payroll run for {month}/{year} already exists")

        _, last_day = calendar.monthrange(year, month)
        as_of = date(year, month, last_day)
        assignments = self.assignment_repo.get_all_current(as_of)
        if not assignments:
            raise ValueError("No employees have a salary assignment yet — assign employees to a salary structure first")

        company = self._get_company()

        run = PayrollRun(
            id=uuid.uuid4(), company_id=self.company_id, year=year, month=month,
            status="draft", created_by_employee_id=actor_employee_id,
        )
        self.db.add(run)
        self.db.flush()

        for seq, assignment in enumerate(assignments, start=1):
            employee = assignment.employee
            result = self._compute_payslip_for_employee(employee, assignment, year, month, company)

            payslip = Payslip(
                id=uuid.uuid4(), company_id=self.company_id, payroll_run_id=run.id,
                employee_id=assignment.employee_id, basic_pay=result["basic_pay"],
                gross_earnings=result["gross_earnings"], gross_deductions=result["gross_deductions"],
                working_days=result["working_days"], lop_days=result["lop_days"],
                lop_amount=result["lop_amount"], net_pay=result["net_pay"],
                payslip_number=f"PS-{year}-{month:02d}-{seq:03d}",
            )
            self.db.add(payslip)
            self.db.flush()

            for name, ctype, amount in result["employer_lines"] + result["lines"]:
                self.db.add(PayslipLine(
                    id=uuid.uuid4(), payslip_id=payslip.id, component_name=name,
                    component_type=ctype, amount=amount,
                ))

        log_action(self.db, self.company_id, actor_employee_id, "payroll.run_created", "payroll_run", run.id)
        self.db.commit()
        self.db.refresh(run)
        return run

    def get_runs(self, skip: int = 0, limit: int = 100) -> list[dict]:
        runs = self.run_repo.get_all(skip, limit)
        result = []
        for run in runs:
            payslips = self.payslip_repo.get_by_run(run.id)
            result.append({
                "id": run.id, "company_id": run.company_id, "year": run.year, "month": run.month,
                "status": run.status, "finalized_at": run.finalized_at, "created_at": run.created_at,
                "payslip_count": len(payslips),
                "total_net_pay": sum((p.net_pay for p in payslips), Decimal(0)),
            })
        return result

    def get_run(self, run_id: UUID) -> PayrollRun | None:
        return self.run_repo.get_by_id(run_id)

    def get_run_payslips(self, run_id: UUID):
        return self.payslip_repo.get_by_run(run_id)

    def finalize_run(self, run_id: UUID, actor_employee_id: UUID | None) -> PayrollRun | None:
        run = self.run_repo.get_by_id(run_id)
        if not run:
            return None
        if run.status == "finalized":
            raise ValueError("This payroll run is already finalized")

        # Apply the side-effecting mutations exactly once, at finalize time:
        # link reimbursed expense claims to their payslip, and decrement
        # loan balances (closing a loan once it hits zero).
        for payslip in self.payslip_repo.get_by_run(run_id):
            claims = self._get_reimbursable_expenses(payslip.employee_id)
            for claim in claims:
                claim.paid_via_payslip_id = payslip.id

            _, details = self._get_loan_deduction_preview(payslip.employee_id)
            for loan, amount in details:
                loan.remaining_balance -= amount
                if loan.remaining_balance <= 0:
                    loan.remaining_balance = Decimal(0)
                    loan.status = "closed"

        run.status = "finalized"
        run.finalized_at = datetime.now(timezone.utc)
        run.finalized_by_employee_id = actor_employee_id
        log_action(self.db, self.company_id, actor_employee_id, "payroll.finalized", "payroll_run", run.id)
        self.db.commit()
        self.db.refresh(run)
        return run

    def delete_run(self, run_id: UUID) -> bool:
        run = self.run_repo.get_by_id(run_id)
        if not run:
            return False
        if run.status == "finalized":
            raise ValueError("Cannot delete a finalized payroll run")
        return self.run_repo.delete(run_id)

    # ── Adjustments ────────────────────────────────────────
    def add_adjustment(self, payslip_id: UUID, data: dict, actor_employee_id: UUID | None) -> Payslip | None:
        payslip = self.payslip_repo.get_by_id(payslip_id)
        if not payslip:
            return None
        run = self.run_repo.get_by_id(payslip.payroll_run_id)
        if not run or run.status != "draft":
            raise ValueError("Cannot adjust a finalized payroll run")

        amount = Decimal(data["amount"])
        self.db.add(PayslipLine(
            id=uuid.uuid4(), payslip_id=payslip.id, component_name=data["component_name"],
            component_type=data["component_type"], amount=amount,
            is_manual_adjustment=True, description=data.get("description"),
        ))

        if data["component_type"] == "earning":
            payslip.gross_earnings += amount
        else:
            payslip.gross_deductions += amount
        payslip.net_pay = payslip.gross_earnings - payslip.gross_deductions

        log_action(self.db, self.company_id, actor_employee_id, "payroll.adjustment_added", "payslip", payslip.id)
        self.db.commit()
        self.db.refresh(payslip)
        return payslip

    # ── Self-service ───────────────────────────────────────
    def get_my_payslips(self, employee_id: UUID):
        """Only finalized payslips — an employee never sees a draft/
        still-being-adjusted run."""
        payslips = self.payslip_repo.get_for_employee(employee_id)
        return [p for p in payslips if p.payroll_run and p.payroll_run.status == "finalized"]

    # ── Gratuity ───────────────────────────────────────────
    def get_gratuity_status(self, employee_id: UUID) -> dict:
        employee = self.db.query(Employee).filter(Employee.id == employee_id).first()
        company = self._get_company()
        if not employee:
            raise ValueError("Employee not found")

        headcount_met = self._get_active_headcount() >= company.gratuity_threshold_employee_count
        years_required = (
            company.gratuity_years_fixed_term if employee.employment_type == "fixed_term"
            else company.gratuity_years_regular
        )
        end_date = employee.date_of_exit or date.today()
        years_of_service = Decimal((end_date - employee.date_of_hire).days) / Decimal(365.25)
        eligible = headcount_met and years_of_service >= years_required

        assignment = self.assignment_repo.get_current_for_employee(employee_id, end_date)
        basic_pay = assignment.basic_pay if assignment else Decimal(0)
        # Standard formula: (Basic / 26) * 15 days * years of service.
        amount = round((basic_pay / Decimal(26)) * Decimal(15) * years_of_service, 2) if eligible else Decimal(0)

        return {
            "eligible": eligible,
            "headcount_met": headcount_met,
            "years_required": years_required,
            "years_of_service": round(years_of_service, 2),
            "estimated_amount": amount,
        }

    # ── Full & Final Settlement ─────────────────────────────
    def initiate_fnf(self, employee_id: UUID, exit_date_: date, exit_reason: str | None, actor_employee_id: UUID | None) -> FnfSettlement:
        employee = self.db.query(Employee).filter(Employee.id == employee_id).first()
        if not employee:
            raise ValueError("Employee not found")

        assignment = self.assignment_repo.get_current_for_employee(employee_id, exit_date_)
        # Simplification: pending salary is pro-rated off Basic Pay only,
        # not the full structure computation (which has side effects like
        # locking in ESI coverage — not appropriate to trigger mid-preview).
        gross = assignment.basic_pay if assignment else Decimal(0)

        _, last_day = calendar.monthrange(exit_date_.year, exit_date_.month)
        days_worked = exit_date_.day
        per_day_rate = (gross / last_day) if last_day and gross else Decimal(0)
        pending_salary = round(per_day_rate * days_worked, 2)

        from app.models.leave_balance import LeaveBalance
        from app.models.leave_type import LeaveType
        balances = (
            self.db.query(LeaveBalance)
            .join(LeaveType, LeaveBalance.leave_type_id == LeaveType.id)
            .filter(
                LeaveBalance.employee_id == employee_id,
                LeaveBalance.year == exit_date_.year,
                LeaveType.is_paid.is_(True),
            )
            .all()
        )
        leave_days = sum((b.balance for b in balances), Decimal(0))
        leave_amount = round(per_day_rate * leave_days, 2)

        gratuity_status = self.get_gratuity_status(employee_id)

        active_loans = self.loan_repo.get_active_for_employee(employee_id)
        outstanding = sum((loan.remaining_balance for loan in active_loans), Decimal(0))

        net_payable = pending_salary + leave_amount + gratuity_status["estimated_amount"] - outstanding

        settlement = FnfSettlement(
            id=uuid.uuid4(), company_id=self.company_id, employee_id=employee_id,
            exit_date=exit_date_, pending_salary_amount=pending_salary,
            leave_encashment_days=leave_days, leave_encashment_amount=leave_amount,
            gratuity_eligible=gratuity_status["eligible"], gratuity_amount=gratuity_status["estimated_amount"],
            outstanding_deductions=outstanding, net_payable=net_payable, status="pending",
        )
        self.db.add(settlement)

        employee.date_of_exit = exit_date_
        employee.exit_reason = exit_reason
        employee.employment_status = "inactive"

        log_action(self.db, self.company_id, actor_employee_id, "payroll.fnf_initiated", "employee", employee_id)
        self.db.commit()
        self.db.refresh(settlement)
        return settlement

    def process_fnf(self, settlement_id: UUID, actor_employee_id: UUID | None) -> FnfSettlement | None:
        settlement = self.fnf_repo.get_by_id(settlement_id)
        if not settlement:
            return None
        if settlement.status == "processed":
            raise ValueError("This settlement has already been processed")

        for loan in self.loan_repo.get_active_for_employee(settlement.employee_id):
            loan.remaining_balance = Decimal(0)
            loan.status = "closed"

        settlement.status = "processed"
        settlement.processed_at = datetime.now(timezone.utc)
        log_action(self.db, self.company_id, actor_employee_id, "payroll.fnf_processed", "fnf_settlement", settlement.id)
        self.db.commit()
        self.db.refresh(settlement)
        return settlement

    def get_fnf_for_employee(self, employee_id: UUID) -> FnfSettlement | None:
        return self.fnf_repo.get_by_employee(employee_id)

    def get_all_fnf(self):
        return self.fnf_repo.get_all()
