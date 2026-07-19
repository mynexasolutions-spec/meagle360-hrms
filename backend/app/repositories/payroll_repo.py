"""Payroll repositories — salary components, structures, employee
assignments, payroll runs, and payslips."""

from uuid import UUID
from datetime import date
from sqlalchemy.orm import Session, joinedload

from app.models.salary_component import SalaryComponent
from app.models.salary_structure import SalaryStructure
from app.models.salary_structure_component import SalaryStructureComponent
from app.models.employee_salary_assignment import EmployeeSalaryAssignment
from app.models.payroll_run import PayrollRun
from app.models.payslip import Payslip
from app.models.tax_slab import TaxSlab
from app.models.professional_tax_slab import ProfessionalTaxSlab
from app.models.employee_loan import EmployeeLoan
from app.models.fnf_settlement import FnfSettlement
from app.repositories.base import BaseRepository


class SalaryComponentRepository(BaseRepository[SalaryComponent]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(SalaryComponent, db, company_id)

    def get_all(self, skip: int = 0, limit: int = 200):
        return (
            self._scoped_query()
            .order_by(SalaryComponent.component_type.asc(), SalaryComponent.display_order.asc())
            .offset(skip).limit(limit).all()
        )


class SalaryStructureRepository(BaseRepository[SalaryStructure]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(SalaryStructure, db, company_id)

    def get_with_components(self, structure_id: UUID):
        return (
            self._scoped_query()
            .options(
                joinedload(SalaryStructure.component_links).joinedload(SalaryStructureComponent.component),
            )
            .filter(SalaryStructure.id == structure_id)
            .first()
        )

    def get_all_with_components(self):
        return (
            self._scoped_query()
            .options(
                joinedload(SalaryStructure.component_links).joinedload(SalaryStructureComponent.component),
            )
            .order_by(SalaryStructure.name.asc())
            .all()
        )


class EmployeeSalaryAssignmentRepository(BaseRepository[EmployeeSalaryAssignment]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(EmployeeSalaryAssignment, db, company_id)

    def get_current_for_employee(self, employee_id: UUID, as_of: date | None = None) -> EmployeeSalaryAssignment | None:
        as_of = as_of or date.today()
        return (
            self._scoped_query()
            .options(joinedload(EmployeeSalaryAssignment.salary_structure))
            .filter(
                EmployeeSalaryAssignment.employee_id == employee_id,
                EmployeeSalaryAssignment.effective_from <= as_of,
            )
            .order_by(EmployeeSalaryAssignment.effective_from.desc())
            .first()
        )

    def get_history_for_employee(self, employee_id: UUID):
        return (
            self._scoped_query()
            .options(joinedload(EmployeeSalaryAssignment.salary_structure))
            .filter(EmployeeSalaryAssignment.employee_id == employee_id)
            .order_by(EmployeeSalaryAssignment.effective_from.desc())
            .all()
        )

    def get_all_current(self, as_of: date | None = None):
        """Latest assignment per employee, as of a date — one row per
        employee with an assignment (used when running payroll)."""
        as_of = as_of or date.today()
        rows = (
            self._scoped_query()
            .options(
                joinedload(EmployeeSalaryAssignment.employee),
                joinedload(EmployeeSalaryAssignment.salary_structure),
            )
            .filter(EmployeeSalaryAssignment.effective_from <= as_of)
            .order_by(EmployeeSalaryAssignment.employee_id, EmployeeSalaryAssignment.effective_from.desc())
            .all()
        )
        latest_by_employee = {}
        for row in rows:
            if row.employee_id not in latest_by_employee:
                latest_by_employee[row.employee_id] = row
        return list(latest_by_employee.values())


class PayrollRunRepository(BaseRepository[PayrollRun]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(PayrollRun, db, company_id)

    def get_by_year_month(self, year: int, month: int) -> PayrollRun | None:
        return (
            self._scoped_query()
            .filter(PayrollRun.year == year, PayrollRun.month == month)
            .first()
        )

    def get_all(self, skip: int = 0, limit: int = 100):
        return (
            self._scoped_query()
            .order_by(PayrollRun.year.desc(), PayrollRun.month.desc())
            .offset(skip).limit(limit).all()
        )


class PayslipRepository(BaseRepository[Payslip]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(Payslip, db, company_id)

    def get_by_run(self, payroll_run_id: UUID):
        return (
            self._scoped_query()
            .options(joinedload(Payslip.employee), joinedload(Payslip.lines))
            .filter(Payslip.payroll_run_id == payroll_run_id)
            .order_by(Payslip.employee_id)
            .all()
        )

    def get_by_run_and_employee(self, payroll_run_id: UUID, employee_id: UUID) -> Payslip | None:
        return (
            self._scoped_query()
            .options(joinedload(Payslip.lines))
            .filter(Payslip.payroll_run_id == payroll_run_id, Payslip.employee_id == employee_id)
            .first()
        )

    def get_for_employee(self, employee_id: UUID, skip: int = 0, limit: int = 50):
        """All finalized payslips for one employee (self-service view) —
        joined to the run so month/year/status are available."""
        return (
            self._scoped_query()
            .options(joinedload(Payslip.lines), joinedload(Payslip.payroll_run))
            .filter(Payslip.employee_id == employee_id)
            .join(Payslip.payroll_run)
            .order_by(Payslip.created_at.desc())
            .offset(skip).limit(limit).all()
        )


class TaxSlabRepository(BaseRepository[TaxSlab]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(TaxSlab, db, company_id)

    def get_by_regime(self, regime: str):
        return (
            self._scoped_query()
            .filter(TaxSlab.regime == regime)
            .order_by(TaxSlab.min_income.asc())
            .all()
        )

    def get_all(self):
        return self._scoped_query().order_by(TaxSlab.regime.asc(), TaxSlab.min_income.asc()).all()


class ProfessionalTaxSlabRepository(BaseRepository[ProfessionalTaxSlab]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(ProfessionalTaxSlab, db, company_id)

    def get_by_state(self, state: str):
        return (
            self._scoped_query()
            .filter(ProfessionalTaxSlab.state == state)
            .order_by(ProfessionalTaxSlab.min_gross.asc())
            .all()
        )

    def get_all(self):
        return self._scoped_query().order_by(ProfessionalTaxSlab.state.asc(), ProfessionalTaxSlab.min_gross.asc()).all()


class EmployeeLoanRepository(BaseRepository[EmployeeLoan]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(EmployeeLoan, db, company_id)

    def get_active_for_employee(self, employee_id: UUID):
        return (
            self._scoped_query()
            .filter(EmployeeLoan.employee_id == employee_id, EmployeeLoan.status == "active")
            .all()
        )

    def get_by_employee(self, employee_id: UUID):
        return (
            self._scoped_query()
            .filter(EmployeeLoan.employee_id == employee_id)
            .order_by(EmployeeLoan.start_date.desc())
            .all()
        )


class FnfSettlementRepository(BaseRepository[FnfSettlement]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(FnfSettlement, db, company_id)

    def get_by_employee(self, employee_id: UUID):
        return (
            self._scoped_query()
            .filter(FnfSettlement.employee_id == employee_id)
            .order_by(FnfSettlement.exit_date.desc())
            .first()
        )

    def get_all(self):
        return self._scoped_query().order_by(FnfSettlement.exit_date.desc()).all()
