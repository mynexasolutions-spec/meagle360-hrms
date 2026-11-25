"""Promotions, demotions, transfers and the job history they leave behind.

This is the only place an existing employee's designation, department or manager
changes. Login roles and permissions are never touched here.
"""

from datetime import date
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models.company import Company
from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee
from app.models.employee_job_change import EmployeeJobChange
from app.models.notification import Notification
from app.services.audit_service import log_action
from app.services.payroll_service import PayrollService
from app.services.pms_monthly_service import today_ist

# What the employee is told. Demotions are worded neutrally on purpose.
_NOTICE = {
    "assigned": "Your designation is now {designation}.",
    "promotion": "Congratulations! You have been promoted to {designation}.",
    "demotion": "Your role has been updated to {designation}.",
    "role_change": "Your role has been updated to {designation}.",
    "transfer": "You have moved to the {department} department.",
    "manager_change": "Your manager is now {manager}.",
}


class StaleDraftError(Exception):
    """Someone was moved after the draft was loaded."""


def _has_left(e: Employee) -> bool:
    return e.employment_status != "active" or bool(e.date_of_exit and e.date_of_exit <= today_ist())


def _designation_type(old: Designation | None, new: Designation) -> str:
    if old is None:
        return "assigned"
    if old.level is None or new.level is None:
        raise ValueError(f"Set a level for both {old.title} and {new.title} first")
    if new.level == old.level:
        return "role_change"
    return "promotion" if new.level > old.level else "demotion"


class JobChangeService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    def _find(self, model, id_: UUID, label: str):
        row = self.db.query(model).filter(model.id == id_, model.company_id == self.company_id).first()
        if not row:
            raise ValueError(f"{label} not found")
        return row

    def _lock_org(self) -> None:
        """One org change at a time per company, so two moves cannot form a loop together."""
        self.db.query(Company.id).filter(Company.id == self.company_id).with_for_update(key_share=True).first()

    def _parents(self) -> dict:
        return {
            i: m for i, m in self.db.query(Employee.id, Employee.manager_id)
            .filter(Employee.company_id == self.company_id)
        }

    @staticmethod
    def _check_manager(employee: Employee, manager: Employee, parents: dict) -> None:
        if manager.id == employee.id:
            raise ValueError("An employee cannot be their own manager")
        if _has_left(manager):
            raise ValueError("The new manager is not an active employee")
        current, seen = manager.id, set()
        while current and current not in seen:
            if current == employee.id:
                raise ValueError(f"{manager.full_name} reports to {employee.full_name}, so cannot be their manager")
            seen.add(current)
            current = parents.get(current)

    def _check_date(self, employee: Employee, effective: date) -> None:
        if effective < employee.date_of_hire:
            raise ValueError("The effective date cannot be before the hire date")
        latest = (
            self.db.query(EmployeeJobChange.effective_date)
            .filter(EmployeeJobChange.employee_id == employee.id)
            .order_by(EmployeeJobChange.effective_date.desc()).first()
        )
        if latest and effective < latest[0]:
            raise ValueError(f"The effective date cannot be before the last change ({latest[0]:%d %b %Y})")

    def apply(self, employee_id: UUID, data: dict, actor_employee_id: UUID | None) -> EmployeeJobChange | None:
        """data holds only the fields the caller sent."""
        self._lock_org()
        change = self._record(employee_id, data, actor_employee_id, self._parents())
        if not change:
            return None
        if data.get("salary"):
            self._revise_salary(employee_id, data["salary"], data["effective_date"])  # commits everything with it
        else:
            self.db.commit()
        self.db.refresh(change)
        return change

    def publish(self, moves: list[dict], actor_employee_id: UUID | None) -> int:
        """Apply a whole draft from the org editor, or none of it."""
        self._lock_org()
        # Managers are checked against the finished chart: swaps pass through loops on the way.
        final = {**self._parents(), **{m["employee_id"]: m["manager_id"] for m in moves}}
        for move in moves:
            e = (
                self.db.query(Employee)
                .filter(Employee.id == move["employee_id"], Employee.company_id == self.company_id)
                .populate_existing().first()
            )
            if not e:
                raise StaleDraftError("An employee in this draft no longer exists")
            if (e.manager_id, e.department_id) != (move["expected_manager_id"], move["expected_department_id"]):
                raise StaleDraftError(f"{e.full_name} was changed by someone else")
            data = {
                "action": "transfer", "effective_date": today_ist(),
                "manager_id": move["manager_id"], "department_id": move["department_id"],
            }
            try:
                self._record(e.id, data, actor_employee_id, final)
            except ValueError as err:
                raise ValueError(f"{e.full_name}: {err}")
        self.db.commit()
        return len(moves)

    def check(self, employee_id: UUID, data: dict) -> bool:
        """Raise if the change could not be applied as things stand. False if there is no such employee."""
        plan = self._plan(employee_id, data, self._parents())
        if plan and data.get("salary"):
            self._check_salary_date(PayrollService(self.db, self.company_id), employee_id, data["effective_date"])
        return plan is not None

    def _plan(self, employee_id: UUID, data: dict, parents: dict) -> tuple | None:
        employee = (
            self.db.query(Employee)
            .filter(Employee.id == employee_id, Employee.company_id == self.company_id)
            .populate_existing().with_for_update().first()
        )
        if not employee:
            return None
        if _has_left(employee):
            raise ValueError("Only an active employee's job can be changed")

        action, effective, reason = data["action"], data["effective_date"], (data.get("reason") or "").strip()
        salary = data.get("salary")
        self._check_date(employee, effective)
        if action == "demote" and not reason:
            raise ValueError("A reason is required for a demotion")
        if salary and action == "transfer":
            raise ValueError("Salary can only be revised with a promotion or demotion")

        old_designation, old_department, old_manager = employee.designation, employee.department, employee.manager
        designation, department, manager = old_designation, old_department, old_manager
        kind = None

        if "manager_id" in data and data["manager_id"] != employee.manager_id:
            manager = None
            if data["manager_id"]:
                manager = self._find(Employee, data["manager_id"], "Manager")
                self._check_manager(employee, manager, parents)
            kind = "manager_change"

        if data.get("department_id") and data["department_id"] != employee.department_id:
            department = self._find(Department, data["department_id"], "Department")
            if old_department and old_department.head_id == employee.id:
                raise ValueError(f"{employee.full_name} heads {old_department.name}. Choose another head first")
            kind = "transfer"

        if data.get("designation_id") and data["designation_id"] != employee.designation_id:
            designation = self._find(Designation, data["designation_id"], "Designation")
            if not designation.is_active:
                raise ValueError(f"{designation.title} is no longer in use")
            by_level = _designation_type(old_designation, designation)
            # A department move with a first or same-level title is still a transfer.
            if kind != "transfer" or by_level in ("promotion", "demotion"):
                kind = by_level

        if kind is None:
            raise ValueError("Nothing has changed")
        if action == "promote" and kind != "promotion":
            raise ValueError("Choose a designation with a higher level to promote")
        if action == "demote" and kind != "demotion":
            raise ValueError("Choose a designation with a lower level to demote")
        if action == "transfer" and kind in ("promotion", "demotion"):
            raise ValueError("That designation has a different level. Use Promote or Demote instead")

        return employee, kind, designation, department, manager

    def _record(self, employee_id: UUID, data: dict, actor_employee_id: UUID | None,
                parents: dict) -> EmployeeJobChange | None:
        effective, reason = data["effective_date"], (data.get("reason") or "").strip()
        salary = data.get("salary")
        if effective > today_ist():
            raise ValueError("The effective date cannot be in the future")
        plan = self._plan(employee_id, data, parents)
        if not plan:
            return None
        employee, kind, designation, department, manager = plan
        old_designation, old_department, old_manager = employee.designation, employee.department, employee.manager

        change = EmployeeJobChange(
            company_id=self.company_id, employee_id=employee.id, change_type=kind, effective_date=effective,
            from_designation=old_designation.title if old_designation else None,
            to_designation=designation.title if designation else None,
            from_department=old_department.name if old_department else None,
            to_department=department.name if department else None,
            from_manager=old_manager.full_name if old_manager else None,
            to_manager=manager.full_name if manager else None,
            salary_revised=bool(salary), reason=reason, actor_employee_id=actor_employee_id,
        )
        self.db.add(change)
        # Ids, not relationships: SQLAlchemy cannot order the saves when two people swap places.
        employee.designation_id = designation.id if designation else None
        employee.department_id = department.id if department else None
        employee.manager_id = data["manager_id"] if "manager_id" in data else employee.manager_id

        message = _NOTICE[kind].format(
            designation=change.to_designation, department=change.to_department,
            manager=change.to_manager or "not assigned")
        self.db.add(Notification(
            company_id=self.company_id, recipient_employee_id=employee.id, actor_employee_id=actor_employee_id,
            type="job_change", title="Job update", message=message,
            entity_type="employee", entity_id=employee.id, link="/profile",
        ))
        log_action(
            self.db, self.company_id, actor_employee_id, f"employee.{kind}", "employee", employee.id,
            {"effective_date": str(effective), "designation": change.to_designation,
             "department": change.to_department, "manager": change.to_manager, "salary_revised": bool(salary)})
        return change

    @staticmethod
    def _check_salary_date(payroll: PayrollService, employee_id: UUID, effective: date):
        """Returns the latest salary; the new one must start after it."""
        history = payroll.get_assignment_history(employee_id)
        latest = history[0] if history else None
        if latest and effective <= latest.effective_from:
            raise ValueError(
                f"Salary is already set from {latest.effective_from:%d %b %Y}. "
                "Use a later date, or leave the salary unchanged")
        return latest

    def _revise_salary(self, employee_id: UUID, salary: dict, effective: date) -> None:
        payroll = PayrollService(self.db, self.company_id)
        latest = self._check_salary_date(payroll, employee_id, effective)
        payroll.assign_employee({
            "employee_id": employee_id,
            "salary_structure_id": latest.salary_structure_id if latest else None,
            "basic_pay": salary["basic_pay"],
            "annual_ctc": salary.get("annual_ctc"),
            "effective_from": effective,
        })

    def history(self, employee_id: UUID, is_admin: bool) -> list[dict]:
        rows = (
            self.db.query(EmployeeJobChange)
            .options(joinedload(EmployeeJobChange.actor))
            .filter(EmployeeJobChange.company_id == self.company_id, EmployeeJobChange.employee_id == employee_id)
            .order_by(EmployeeJobChange.effective_date.desc(), EmployeeJobChange.created_at.desc())
            .all()
        )
        return [self.to_dict(r, is_admin) for r in rows]

    @staticmethod
    def to_dict(r: EmployeeJobChange, is_admin: bool) -> dict:
        fields = ("id", "effective_date", "from_designation", "to_designation", "from_department", "to_department",
                  "from_manager", "to_manager", "created_at")
        return {
            **{f: getattr(r, f) for f in fields},
            "change_type": "role_change" if r.change_type == "demotion" and not is_admin else r.change_type,
            "salary_revised": r.salary_revised and is_admin,
            "reason": r.reason if is_admin else None,
            "actor_name": r.actor.full_name if is_admin and r.actor else None,
        }
