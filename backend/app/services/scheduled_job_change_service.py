"""Job changes dated in the future: scheduling, cancelling, and applying them when due."""

import logging
import threading
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee
from app.models.notification import Notification
from app.models.org_planning import ScheduledJobChange
from app.schemas.job_change import JobChangeCreate
from app.services.audit_service import log_action
from app.services.job_change_service import JobChangeService
from app.services.pms_monthly_service import today_ist

logger = logging.getLogger(__name__)

CHECK_EVERY_SECONDS = 15 * 60


class ScheduledJobChangeService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    def schedule(self, employee_id: UUID, data: JobChangeCreate, actor_id: UUID | None) -> ScheduledJobChange | None:
        fields = data.model_dump(exclude_unset=True)
        if not JobChangeService(self.db, self.company_id).check(employee_id, fields):
            return None
        row = ScheduledJobChange(
            company_id=self.company_id, employee_id=employee_id, effective_date=data.effective_date,
            payload=data.model_dump(mode="json", exclude_unset=True), created_by_employee_id=actor_id)
        self.db.add(row)
        log_action(self.db, self.company_id, actor_id, "employee.change_scheduled", "employee", employee_id,
                   {"action": data.action, "effective_date": str(data.effective_date)})
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise ValueError("A change is already scheduled for this employee. Cancel it first")
        self.db.refresh(row)
        return row

    def list_open(self, employee_id: UUID) -> list[dict]:
        """Pending changes, and failed ones so nobody misses them."""
        rows = (
            self.db.query(ScheduledJobChange)
            .filter(ScheduledJobChange.company_id == self.company_id, ScheduledJobChange.employee_id == employee_id,
                    ScheduledJobChange.status.in_(("pending", "failed")))
            .order_by(ScheduledJobChange.effective_date).all()
        )
        return [self.to_dict(r) for r in rows]

    def to_dict(self, r: ScheduledJobChange) -> dict:
        def label(model, key, column):
            value = r.payload.get(key)
            row = self.db.query(column).filter(
                model.id == UUID(value), model.company_id == self.company_id).first() if value else None
            return row[0] if row else None

        return {
            "id": r.id, "scheduled": True, "status": r.status, "error": r.error,
            "action": r.payload["action"], "effective_date": r.effective_date,
            "designation": label(Designation, "designation_id", Designation.title),
            "department": label(Department, "department_id", Department.name),
            "manager": label(Employee, "manager_id", Employee.full_name),
            "salary_revised": bool(r.payload.get("salary")),
        }

    def cancel(self, employee_id: UUID, change_id: UUID, actor_id: UUID | None) -> bool:
        """Cancels a pending change, or dismisses a failed one."""
        row = (
            self.db.query(ScheduledJobChange)
            .filter(ScheduledJobChange.id == change_id, ScheduledJobChange.employee_id == employee_id,
                    ScheduledJobChange.company_id == self.company_id,
                    ScheduledJobChange.status.in_(("pending", "failed")))
            .with_for_update().first()
        )
        if not row:
            return False
        row.status = "cancelled"
        log_action(self.db, self.company_id, actor_id, "employee.schedule_cancelled", "employee", employee_id)
        self.db.commit()
        return True


def apply_due(db: Session) -> int:
    """Apply every due change, each in its own transaction. Returns how many were applied."""
    ids = [
        i for (i,) in db.query(ScheduledJobChange.id)
        .filter(ScheduledJobChange.status == "pending", ScheduledJobChange.effective_date <= today_ist())
        .order_by(ScheduledJobChange.effective_date, ScheduledJobChange.created_at)
    ]
    applied = 0
    for id_ in ids:
        # skip_locked: another worker has it. The row lock lasts until the change itself commits.
        row = (
            db.query(ScheduledJobChange)
            .filter(ScheduledJobChange.id == id_, ScheduledJobChange.status == "pending")
            .populate_existing().with_for_update(skip_locked=True).first()
        )
        if not row:
            db.rollback()
            continue
        company_id, employee_id, actor_id = row.company_id, row.employee_id, row.created_by_employee_id
        try:
            fields = JobChangeCreate(**row.payload).model_dump(exclude_unset=True)
            row.status = "applied"  # saved together with the change
            if not JobChangeService(db, company_id).apply(employee_id, fields, actor_id):
                raise ValueError("Employee not found")
            applied += 1
        except Exception as err:  # one bad row must not stop the rest
            db.rollback()
            if not isinstance(err, ValueError):
                logger.exception("Scheduled job change %s failed", id_)
            reason = str(err) if isinstance(err, ValueError) else "Something went wrong"
            _mark_failed(db, id_, reason)
    return applied


def _mark_failed(db: Session, id_: UUID, reason: str) -> None:
    row = db.query(ScheduledJobChange).filter(
        ScheduledJobChange.id == id_, ScheduledJobChange.status == "pending").first()
    if not row:
        return
    row.status, row.error = "failed", reason[:500]
    employee = db.query(Employee).filter(Employee.id == row.employee_id).first()
    if row.created_by_employee_id and employee:
        db.add(Notification(
            company_id=row.company_id, recipient_employee_id=row.created_by_employee_id,
            type="job_change", title="Scheduled change failed",
            message=f"{employee.full_name}: {reason}"[:1000],
            entity_type="employee", entity_id=employee.id, link=f"/employees/{employee.id}",
        ))
    db.commit()


def start_background(stop: threading.Event) -> threading.Thread:
    def loop():
        while True:
            try:
                with SessionLocal() as db:
                    apply_due(db)
            except Exception:
                logger.exception("Could not apply scheduled job changes")
            if stop.wait(CHECK_EVERY_SECONDS):
                return

    thread = threading.Thread(target=loop, name="scheduled-job-changes", daemon=True)
    thread.start()
    return thread
