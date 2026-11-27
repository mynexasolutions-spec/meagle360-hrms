"""Employee offboarding: notice period -> exit, never a delete.

Flow:
  start()    HR records exit type, resignation date and last working day
             (LWD). The employee stays employment_status='active' (payroll,
             attendance, login keep working) with offboarding_status='notice'.
             If the LWD is already in the past the exit happens at once.
  exit_now() HR ends it early, e.g. right after generating the relieving letter.
  apply_due() background job: the day after the LWD the exit happens
             automatically (the employee can still log in on their last day).
  cancel()   resignation withdrawn: back to a normal active employee.

Exiting sets employment_status='inactive', date_of_exit and
offboarding_status='exited'. The record and all its history (payslips,
attendance, relieving letters, F&F) are kept; an inactive employee can no
longer log in (see app.dependencies.get_current_user)."""

import logging
import threading
from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.ats import Application, Stage
from app.models.employee import Employee
from app.models.expense_claim import ExpenseClaim
from app.models.fnf_settlement import FnfSettlement
from app.models.leave_request import LeaveRequest
from app.models.relieving_letter_record import RelievingLetterRecord
from app.services.audit_service import log_action
from app.services.pms_monthly_service import today_ist

logger = logging.getLogger(__name__)

EXIT_TYPES = ("resignation", "termination", "retirement", "absconding", "contract_end", "other")
CHECK_EVERY_SECONDS = 30 * 60


class OffboardingError(ValueError):
    """A request that breaks an offboarding rule (shown to the user as 400)."""


def _finalize(db: Session, emp: Employee, actor_employee_id: UUID | None, how: str) -> None:
    emp.employment_status = "inactive"
    emp.offboarding_status = "exited"
    emp.date_of_exit = emp.last_working_date or today_ist()
    log_action(db, emp.company_id, actor_employee_id, "employee.offboarding_exited", "employee", emp.id,
               {"last_working_date": str(emp.date_of_exit), "how": how})


class OffboardingService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    def _employee(self, employee_id: UUID) -> Employee:
        emp = (self.db.query(Employee)
               .filter(Employee.id == employee_id, Employee.company_id == self.company_id)
               .first())
        if not emp:
            raise LookupError("Employee not found")
        return emp

    # ── Read ──────────────────────────────────────────────

    def summary(self, employee_id: UUID) -> dict:
        """Current offboarding state plus things HR should sort out first.
        Warnings never block the exit."""
        emp = self._employee(employee_id)
        reports = (self.db.query(Employee)
                   .filter(Employee.company_id == self.company_id, Employee.manager_id == emp.id,
                           Employee.employment_status == "active")
                   .order_by(Employee.full_name).all())
        report_ids = [r.id for r in reports]
        pending_leave = pending_expense = 0
        if report_ids:
            pending_leave = (self.db.query(LeaveRequest)
                             .filter(LeaveRequest.company_id == self.company_id,
                                     LeaveRequest.employee_id.in_(report_ids),
                                     LeaveRequest.status == "pending").count())
            pending_expense = (self.db.query(ExpenseClaim)
                               .filter(ExpenseClaim.company_id == self.company_id,
                                       ExpenseClaim.employee_id.in_(report_ids),
                                       ExpenseClaim.status == "pending").count())
        open_apps = (self.db.query(Application)
                     .join(Stage, Application.stage_id == Stage.id)
                     .filter(Application.company_id == self.company_id, Application.assigned_to == emp.id,
                             Stage.is_terminal.is_(False)).count())
        fnf = (self.db.query(FnfSettlement)
               .filter(FnfSettlement.company_id == self.company_id, FnfSettlement.employee_id == emp.id)
               .order_by(FnfSettlement.created_at.desc()).first())
        letters = (self.db.query(RelievingLetterRecord)
                   .filter(RelievingLetterRecord.company_id == self.company_id,
                           RelievingLetterRecord.employee_id == emp.id)
                   .order_by(RelievingLetterRecord.created_at.desc()).all())
        return {
            "employee_id": emp.id,
            "full_name": emp.full_name,
            "employment_status": emp.employment_status,
            "offboarding_status": emp.offboarding_status,
            "exit_type": emp.exit_type,
            "resignation_date": emp.resignation_date,
            "last_working_date": emp.last_working_date,
            "date_of_exit": emp.date_of_exit,
            "exit_reason": emp.exit_reason,
            "warnings": {
                "direct_reports": [{"id": r.id, "full_name": r.full_name} for r in reports],
                "pending_leave_approvals": pending_leave,
                "pending_expense_approvals": pending_expense,
                "open_ats_applications": open_apps,
                "fnf_status": fnf.status if fnf else None,
            },
            "relieving_letters": [{"id": l.id, "last_working_date": l.last_working_date,
                                   "created_at": l.created_at} for l in letters],
        }

    # ── Actions ───────────────────────────────────────────

    def start(self, employee_id: UUID, data: dict, actor_employee_id: UUID | None) -> dict:
        """Record (or change) the exit. Calling it again during the notice
        period updates the dates."""
        emp = self._employee(employee_id)
        if emp.offboarding_status == "exited" or emp.employment_status != "active":
            raise OffboardingError("This employee has already exited.")
        if actor_employee_id and actor_employee_id == emp.id:
            raise OffboardingError("You cannot offboard yourself.")
        exit_type = data["exit_type"]
        if exit_type not in EXIT_TYPES:
            raise OffboardingError("Unknown exit type.")
        lwd: date = data["last_working_date"]
        resignation: date | None = data.get("resignation_date")
        if lwd < emp.date_of_hire:
            raise OffboardingError("Last working day cannot be before the date of joining.")
        if resignation and resignation > lwd:
            raise OffboardingError("Resignation date cannot be after the last working day.")

        first_time = emp.offboarding_status != "notice"
        emp.exit_type = exit_type
        emp.resignation_date = resignation
        emp.last_working_date = lwd
        emp.exit_reason = (data.get("exit_reason") or "").strip()[:255] or None
        emp.offboarding_status = "notice"
        if first_time:
            emp.offboarding_started_at = datetime.now(timezone.utc)
        log_action(self.db, self.company_id, actor_employee_id,
                   "employee.offboarding_started" if first_time else "employee.offboarding_updated",
                   "employee", emp.id, {"exit_type": exit_type, "last_working_date": str(lwd)})
        if lwd < today_ist():
            _finalize(self.db, emp, actor_employee_id, "past_last_working_day")
        self.db.commit()
        return self.summary(emp.id)

    def exit_now(self, employee_id: UUID, actor_employee_id: UUID | None) -> dict:
        emp = self._employee(employee_id)
        if emp.offboarding_status != "notice":
            raise OffboardingError("Start offboarding for this employee first.")
        if emp.last_working_date and emp.last_working_date > today_ist():
            # Leaving before the planned day: the exit date becomes today.
            emp.last_working_date = today_ist()
        _finalize(self.db, emp, actor_employee_id, "manual")
        self.db.commit()
        return self.summary(emp.id)

    def cancel(self, employee_id: UUID, actor_employee_id: UUID | None) -> dict:
        """Resignation withdrawn (or exit undone): a normal active employee again.
        Not allowed once a full & final settlement exists - reverse that in
        payroll first."""
        emp = self._employee(employee_id)
        if emp.offboarding_status not in ("notice", "exited"):
            raise OffboardingError("This employee is not being offboarded.")
        has_fnf = (self.db.query(FnfSettlement)
                   .filter(FnfSettlement.company_id == self.company_id, FnfSettlement.employee_id == emp.id)
                   .count())
        if has_fnf:
            raise OffboardingError("A full & final settlement exists for this employee. Reverse it in payroll first.")
        was = emp.offboarding_status
        emp.employment_status = "active"
        emp.offboarding_status = None
        emp.exit_type = None
        emp.resignation_date = None
        emp.last_working_date = None
        emp.date_of_exit = None
        emp.exit_reason = None
        emp.offboarding_started_at = None
        log_action(self.db, self.company_id, actor_employee_id, "employee.offboarding_cancelled",
                   "employee", emp.id, {"was": was})
        self.db.commit()
        return self.summary(emp.id)


# ── Background job ────────────────────────────────────────

def apply_due(db: Session, today: date | None = None) -> int:
    """Exit everyone whose last working day has passed (all tenants)."""
    today = today or today_ist()
    due = (db.query(Employee)
           .filter(Employee.offboarding_status == "notice", Employee.last_working_date < today)
           .all())
    for emp in due:
        _finalize(db, emp, None, "automatic")
    if due:
        db.commit()
    return len(due)


def start_background(stop: threading.Event) -> threading.Thread:
    def loop():
        while True:
            try:
                with SessionLocal() as db:
                    n = apply_due(db)
                    if n:
                        logger.info("Offboarding: %s employee(s) exited after their last working day", n)
            except Exception:
                logger.exception("Offboarding background job failed")
            if stop.wait(CHECK_EVERY_SECONDS):
                return

    thread = threading.Thread(target=loop, name="employee-offboarding", daemon=True)
    thread.start()
    return thread
