"""Leave service — requests, approvals, balance tracking, accrual."""

from uuid import UUID
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session

from app.models.leave_request import LeaveRequest
from app.models.leave_balance import LeaveBalance
from app.repositories.leave_repo import (
    LeaveTypeRepository,
    LeaveBalanceRepository,
    LeaveRequestRepository,
)
from app.services.audit_service import log_action


class LeaveService:
    def __init__(self, db: Session, company_id: UUID):
        self.type_repo = LeaveTypeRepository(db, company_id)
        self.balance_repo = LeaveBalanceRepository(db, company_id)
        self.request_repo = LeaveRequestRepository(db, company_id)
        self.db = db
        self.company_id = company_id

    # ── Leave Types ──────────────────────────────────────
    def get_leave_types(self):
        return self.type_repo.get_all()

    def create_leave_type(self, data: dict):
        return self.type_repo.create(data)

    def update_leave_type(self, id: UUID, data: dict):
        return self.type_repo.update(id, data)

    # ── Leave Balances ───────────────────────────────────
    def get_balances(self, employee_id: UUID, year: int | None = None):
        if year is None:
            year = date.today().year
        return self.balance_repo.get_by_employee(employee_id, year)

    # ── Leave Requests ───────────────────────────────────
    def request_leave(self, employee_id: UUID, data: dict) -> LeaveRequest:
        """Submit a new leave request after checking balance."""
        year = data["start_date"].year
        balance = self.balance_repo.get_specific(
            employee_id, data["leave_type_id"], year
        )

        # Calculate days requested
        days = (data["end_date"] - data["start_date"]).days + 1
        if balance and balance.balance < days:
            raise ValueError(
                f"Insufficient leave balance. Available: {balance.balance}, Requested: {days}"
            )

        request = LeaveRequest(
            company_id=self.company_id,
            employee_id=employee_id,
            leave_type_id=data["leave_type_id"],
            start_date=data["start_date"],
            end_date=data["end_date"],
            status="pending",
        )
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        return request

    def get_my_requests(self, employee_id: UUID, skip=0, limit=50):
        return self.request_repo.get_by_employee(employee_id, skip, limit)

    def get_pending_requests(self, skip=0, limit=50):
        return self.request_repo.get_pending(skip, limit)

    def approve_reject(self, request_id: UUID, status: str, reviewer_employee_id: UUID) -> LeaveRequest | None:
        """Approve or reject a leave request and update balance."""
        leave_req = self.request_repo.get_by_id(request_id)
        if not leave_req:
            return None
        if leave_req.status != "pending":
            raise ValueError(f"Request is already {leave_req.status}")

        leave_req.status = status
        if status == "approved":
            # Deduct from balance
            days = (leave_req.end_date - leave_req.start_date).days + 1
            balance = self.balance_repo.get_specific(
                leave_req.employee_id,
                leave_req.leave_type_id,
                leave_req.start_date.year,
            )
            if balance:
                balance.balance -= Decimal(days)

        log_action(
            self.db, self.company_id, reviewer_employee_id,
            f"leave.{status}", "leave_request", leave_req.id,
        )
        self.db.commit()
        self.db.refresh(leave_req)
        return leave_req

    def count_pending(self) -> int:
        return self.request_repo.count_pending()

    def accrue_monthly(self):
        """Run monthly accrual for all employees — called by cron/scheduler."""
        from app.models.employee import Employee

        year = date.today().year
        leave_types = self.type_repo.get_all()
        employees = (
            self.db.query(Employee)
            .filter(Employee.company_id == self.company_id)
            .all()
        )

        for emp in employees:
            for lt in leave_types:
                balance = self.balance_repo.get_specific(emp.id, lt.id, year)
                if balance:
                    balance.balance += lt.accrual_rate
                else:
                    new_balance = LeaveBalance(
                        company_id=self.company_id,
                        employee_id=emp.id,
                        leave_type_id=lt.id,
                        balance=lt.accrual_rate,
                        year=year,
                    )
                    self.db.add(new_balance)

        self.db.commit()
