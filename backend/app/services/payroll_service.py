"""Payroll service — salary structures, employee assignments, payroll runs,
and the LOP (loss-of-pay) calculation engine.

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
from app.models.holiday_calendar import HolidayCalendar
from app.models.salary_structure import SalaryStructure
from app.models.salary_structure_component import SalaryStructureComponent
from app.models.employee_salary_assignment import EmployeeSalaryAssignment
from app.models.payroll_run import PayrollRun
from app.models.payslip import Payslip
from app.models.payslip_line import PayslipLine
from app.repositories.payroll_repo import (
    SalaryComponentRepository,
    SalaryStructureRepository,
    EmployeeSalaryAssignmentRepository,
    PayrollRunRepository,
    PayslipRepository,
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

    # ── Employee Salary Assignments ───────────────────────
    def assign_employee(self, data: dict) -> EmployeeSalaryAssignment:
        assignment = EmployeeSalaryAssignment(
            id=uuid.uuid4(), company_id=self.company_id,
            employee_id=data["employee_id"],
            salary_structure_id=data.get("salary_structure_id"),
            basic_pay=data["basic_pay"],
            effective_from=data["effective_from"],
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
        returning (working_days, lop_days). A working day counts as LOP
        unless the employee has an attendance session that day or an
        *approved* leave request whose leave type is marked paid."""
        company = self.db.query(Company).filter(Company.id == self.company_id).first()
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

        records = AttendanceRepository(self.db, self.company_id).get_by_date_range(start, end, employee_id)
        present_dates = set()
        for rec in records:
            d = rec.clock_in.date() if isinstance(rec.clock_in, datetime) else rec.clock_in
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
            if d not in present_dates:
                if d not in leave_is_paid_by_date or not leave_is_paid_by_date[d]:
                    lop_days += 1
            d += timedelta(days=1)

        return working_days, lop_days

    # ── Computation engine ────────────────────────────────
    def _compute_structure_lines(self, salary_structure_id: UUID | None, basic_pay: Decimal):
        """Returns (earning_lines, deduction_lines, total_earnings,
        total_deductions, gross) for one employee's structure + basic pay.
        Earnings are computed first (against basic_pay), then deductions
        (against basic_pay or the resulting gross), matching how allowances
        anchor to Basic and statutory deductions anchor to Gross."""
        components = []
        if salary_structure_id:
            structure = self.structure_repo.get_with_components(salary_structure_id)
            if structure:
                components = [
                    link.component for link in structure.component_links
                    if link.component and link.component.is_active
                ]
        components.sort(key=lambda c: (c.component_type, c.display_order))

        earning_lines = []
        for c in components:
            if c.component_type != "earning":
                continue
            if c.calculation_type == "percent_of_basic":
                amount = basic_pay * c.value / Decimal(100)
            else:  # fixed (or percent_of_gross, which isn't meaningful pre-gross — treated as fixed fallback)
                amount = c.value
            earning_lines.append((c.name, "earning", round(amount, 2)))

        total_earnings = sum((a for _, _, a in earning_lines), Decimal(0))
        gross = basic_pay + total_earnings

        deduction_lines = []
        for c in components:
            if c.component_type != "deduction":
                continue
            if c.calculation_type == "percent_of_basic":
                amount = basic_pay * c.value / Decimal(100)
            elif c.calculation_type == "percent_of_gross":
                amount = gross * c.value / Decimal(100)
            else:
                amount = c.value
            deduction_lines.append((c.name, "deduction", round(amount, 2)))

        total_deductions = sum((a for _, _, a in deduction_lines), Decimal(0))
        return earning_lines, deduction_lines, total_earnings, total_deductions, gross

    # ── Payroll Runs ───────────────────────────────────────
    def run_payroll(self, year: int, month: int, actor_employee_id: UUID | None) -> PayrollRun:
        if self.run_repo.get_by_year_month(year, month):
            raise ValueError(f"A payroll run for {month}/{year} already exists")

        _, last_day = calendar.monthrange(year, month)
        as_of = date(year, month, last_day)
        assignments = self.assignment_repo.get_all_current(as_of)
        if not assignments:
            raise ValueError("No employees have a salary assignment yet — assign employees to a salary structure first")

        run = PayrollRun(
            id=uuid.uuid4(), company_id=self.company_id, year=year, month=month,
            status="draft", created_by_employee_id=actor_employee_id,
        )
        self.db.add(run)
        self.db.flush()

        for assignment in assignments:
            earning_lines, deduction_lines, total_earnings, total_deductions, gross = (
                self._compute_structure_lines(assignment.salary_structure_id, assignment.basic_pay)
            )
            working_days, lop_days = self._get_month_lop_summary(assignment.employee_id, year, month)
            per_day_rate = (gross / last_day) if last_day else Decimal(0)
            lop_amount = round(per_day_rate * lop_days, 2)
            net_pay = gross - total_deductions - lop_amount

            payslip = Payslip(
                id=uuid.uuid4(), company_id=self.company_id, payroll_run_id=run.id,
                employee_id=assignment.employee_id, basic_pay=assignment.basic_pay,
                gross_earnings=total_earnings, gross_deductions=total_deductions,
                working_days=working_days, lop_days=lop_days, lop_amount=lop_amount,
                net_pay=net_pay,
            )
            self.db.add(payslip)
            self.db.flush()

            for name, ctype, amount in earning_lines + deduction_lines:
                self.db.add(PayslipLine(
                    id=uuid.uuid4(), payslip_id=payslip.id, component_name=name,
                    component_type=ctype, amount=amount,
                ))
            if lop_days > 0:
                self.db.add(PayslipLine(
                    id=uuid.uuid4(), payslip_id=payslip.id,
                    component_name=f"Loss of Pay ({lop_days} day{'s' if lop_days != 1 else ''})",
                    component_type="deduction", amount=lop_amount,
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
        gross = payslip.basic_pay + payslip.gross_earnings
        payslip.net_pay = gross - payslip.gross_deductions - payslip.lop_amount

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
