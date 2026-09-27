"""Helpdesk service — ticket creation, role-scoped listing, threaded replies."""

from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session, joinedload

from app.models.helpdesk_ticket import HelpdeskTicket, HelpdeskTicketReply
from app.models.employee import Employee
from app.services.audit_service import log_action


class HelpdeskService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    def create_ticket(self, employee_id: UUID, data: dict) -> HelpdeskTicket:
        ticket = HelpdeskTicket(
            company_id=self.company_id,
            employee_id=employee_id,
            category=data["category"],
            subject=data["subject"],
            description=data["description"],
            status="open",
        )
        self.db.add(ticket)
        self.db.flush()
        log_action(self.db, self.company_id, employee_id, "helpdesk.ticket_created", "helpdesk_ticket", ticket.id)
        self.db.commit()
        self.db.refresh(ticket)
        return ticket

    def get_my_tickets(self, employee_id: UUID) -> list[HelpdeskTicket]:
        return (
            self.db.query(HelpdeskTicket)
            .filter(HelpdeskTicket.company_id == self.company_id, HelpdeskTicket.employee_id == employee_id)
            .options(joinedload(HelpdeskTicket.employee), joinedload(HelpdeskTicket.replies).joinedload(HelpdeskTicketReply.author))
            .order_by(HelpdeskTicket.created_at.desc())
            .all()
        )

    def get_tickets_for_manager(self, manager_employee_id: UUID) -> list[HelpdeskTicket]:
        subordinate_ids = (
            self.db.query(Employee.id)
            .filter(Employee.company_id == self.company_id, Employee.manager_id == manager_employee_id)
        )
        return (
            self.db.query(HelpdeskTicket)
            .filter(HelpdeskTicket.company_id == self.company_id, HelpdeskTicket.employee_id.in_(subordinate_ids))
            .options(joinedload(HelpdeskTicket.employee), joinedload(HelpdeskTicket.replies).joinedload(HelpdeskTicketReply.author))
            .order_by(HelpdeskTicket.created_at.desc())
            .all()
        )

    def get_all_tickets(self) -> list[HelpdeskTicket]:
        return (
            self.db.query(HelpdeskTicket)
            .filter(HelpdeskTicket.company_id == self.company_id)
            .options(joinedload(HelpdeskTicket.employee), joinedload(HelpdeskTicket.replies).joinedload(HelpdeskTicketReply.author))
            .order_by(HelpdeskTicket.created_at.desc())
            .all()
        )

    def get_ticket(self, ticket_id: UUID) -> HelpdeskTicket | None:
        return (
            self.db.query(HelpdeskTicket)
            .filter(HelpdeskTicket.id == ticket_id, HelpdeskTicket.company_id == self.company_id)
            .options(joinedload(HelpdeskTicket.employee), joinedload(HelpdeskTicket.replies).joinedload(HelpdeskTicketReply.author))
            .first()
        )

    def update_status(self, ticket_id: UUID, status: str, actor_employee_id: UUID) -> HelpdeskTicket | None:
        ticket = self.get_ticket(ticket_id)
        if not ticket:
            return None
        ticket.status = status
        if status in ("resolved", "closed"):
            ticket.closed_at = datetime.now(timezone.utc)
        log_action(self.db, self.company_id, actor_employee_id, f"helpdesk.status_{status}", "helpdesk_ticket", ticket.id)
        self.db.commit()
        self.db.refresh(ticket)
        return ticket

    def add_reply(self, ticket_id: UUID, author_employee_id: UUID, author_role: str, message: str) -> HelpdeskTicket | None:
        ticket = self.get_ticket(ticket_id)
        if not ticket:
            return None
        reply = HelpdeskTicketReply(
            ticket_id=ticket_id,
            author_employee_id=author_employee_id,
            author_role=author_role,
            message=message,
        )
        self.db.add(reply)
        log_action(self.db, self.company_id, author_employee_id, "helpdesk.replied", "helpdesk_ticket", ticket_id)
        self.db.commit()
        self.db.refresh(ticket)
        return ticket

    def manager_can_view(self, manager_employee_id: UUID, ticket: HelpdeskTicket) -> bool:
        employee = self.db.query(Employee).filter(Employee.id == ticket.employee_id).first()
        return employee is not None and employee.manager_id == manager_employee_id
