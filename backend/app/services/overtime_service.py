"""Overtime service — request + approval workflow."""

from uuid import UUID
from sqlalchemy.orm import Session

from app.models.overtime_request import OvertimeRequest
from app.repositories.overtime_repo import OvertimeRepository
from app.services.audit_service import log_action


class OvertimeService:
    def __init__(self, db: Session, company_id: UUID):
        self.repo = OvertimeRepository(db, company_id)
        self.db = db
        self.company_id = company_id

    def request_overtime(self, employee_id: UUID, data: dict) -> OvertimeRequest:
        req = OvertimeRequest(
            company_id=self.company_id,
            employee_id=employee_id,
            request_date=data["request_date"],
            hours=data["hours"],
            reason=data["reason"],
            status="pending",
        )
        self.db.add(req)
        self.db.commit()
        self.db.refresh(req)
        return req

    def get_my_requests(self, employee_id: UUID, skip=0, limit=50):
        return self.repo.get_by_employee(employee_id, skip, limit)

    def get_pending_requests(self, skip=0, limit=50):
        return self.repo.get_pending(skip, limit)

    def count_pending(self) -> int:
        return self.repo.count_pending()

    def approve_reject(self, request_id: UUID, status: str, reviewer_employee_id: UUID) -> OvertimeRequest | None:
        req = self.repo.get_by_id(request_id)
        if not req:
            return None
        if req.status != "pending":
            raise ValueError(f"Request is already {req.status}")

        req.status = status
        req.reviewed_by_employee_id = reviewer_employee_id

        log_action(
            self.db, self.company_id, reviewer_employee_id,
            f"overtime.{status}", "overtime_request", req.id,
        )
        self.db.commit()
        self.db.refresh(req)
        return req
