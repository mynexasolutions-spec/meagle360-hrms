"""Audit logging — lightweight helper called from services at key mutation points."""

from uuid import UUID
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def log_action(
    db: Session,
    company_id: UUID,
    actor_employee_id: UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    details: dict | None = None,
) -> None:
    """Record an audit entry. Caller is responsible for committing the
    surrounding transaction (this just adds to the session)."""
    db.add(AuditLog(
        company_id=company_id,
        actor_employee_id=actor_employee_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
    ))


def resolve_target_labels(db: Session, company_id: UUID, logs: list[AuditLog]) -> dict[UUID, str]:
    """Best-effort human-readable description of what each audit entry acted on,
    keyed by audit log id. Resolved at read time so older entries get labels too.
    Entity types we don't know about are simply omitted."""
    from app.models.announcement import Announcement
    from app.models.employee import Employee
    from app.models.expense_claim import ExpenseClaim
    from app.models.helpdesk_ticket import HelpdeskTicket
    from app.models.leave_request import LeaveRequest
    from app.models.payroll_run import PayrollRun

    def ids_for(entity_type: str) -> set[UUID]:
        return {l.entity_id for l in logs if l.entity_type == entity_type and l.entity_id}

    def fetch(model, ids: set[UUID]) -> dict[UUID, object]:
        if not ids:
            return {}
        rows = db.query(model).filter(model.company_id == company_id, model.id.in_(ids)).all()
        return {r.id: r for r in rows}

    leaves = fetch(LeaveRequest, ids_for("leave_request"))
    claims = fetch(ExpenseClaim, ids_for("expense_claim"))
    tickets = fetch(HelpdeskTicket, ids_for("helpdesk_ticket"))
    notices = fetch(Announcement, ids_for("announcement"))
    runs = fetch(PayrollRun, ids_for("payroll_run"))

    # Employees: directly targeted ones plus owners of leaves / claims / tickets.
    emp_ids = ids_for("employee")
    emp_ids |= {r.employee_id for r in leaves.values()}
    emp_ids |= {r.employee_id for r in claims.values()}
    emp_ids |= {r.employee_id for r in tickets.values()}
    employees = fetch(Employee, emp_ids)

    def name(emp_id) -> str:
        e = employees.get(emp_id)
        return e.full_name if e else "Unknown employee"

    def day(d) -> str:
        return d.strftime("%d %b") if d else ""

    labels: dict[UUID, str] = {}
    for log in logs:
        eid, et = log.entity_id, log.entity_type
        label = None
        if et == "employee" and eid in employees:
            label = employees[eid].full_name
        elif et == "leave_request" and eid in leaves:
            r = leaves[eid]
            span = day(r.start_date) if r.start_date == r.end_date else f"{day(r.start_date)} – {day(r.end_date)}"
            label = f"{name(r.employee_id)} ({span})"
        elif et == "expense_claim" and eid in claims:
            r = claims[eid]
            label = f"{name(r.employee_id)} (₹{r.amount})"
        elif et == "helpdesk_ticket" and eid in tickets:
            r = tickets[eid]
            label = f"{r.subject} — {name(r.employee_id)}"
        elif et == "announcement" and eid in notices:
            label = notices[eid].title
        elif et in ("company_policy", "required_document", "employee_document", "department", "vacant_position"):
            label = (log.details or {}).get("title")
        elif et == "payroll_run" and eid in runs:
            r = runs[eid]
            label = f"Payroll {r.month:02d}/{r.year}"
        if label:
            labels[log.id] = label
    return labels
