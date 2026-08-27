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
        """Submit a new leave request after checking balance. Unpaid (Loss
        of Pay) leave types are exempt from the balance check entirely —
        their whole purpose is to let someone take leave with no paid
        entitlement remaining, so requiring a balance for them (which never
        accrues, since accrual_rate stays 0 by design) would make it
        impossible to ever actually use one."""
        if data["end_date"] < data["start_date"]:
            raise ValueError("End date cannot be before start date.")
        if data["start_date"] < date.today():
            raise ValueError("Start date cannot be in the past.")
        year = data["start_date"].year
        overlapping = self.request_repo.get_by_employee_and_date_range(
            employee_id, data["start_date"], data["end_date"]
        )
        if overlapping:
            raise ValueError(
                "You already have a pending or approved leave request overlapping these dates."
            )
        leave_type = self.type_repo.get_by_id(data["leave_type_id"])

        # Calculate days requested
        days = (data["end_date"] - data["start_date"]).days + 1
        if not leave_type or leave_type.is_paid:
            balance = self.balance_repo.get_specific(
                employee_id, data["leave_type_id"], year
            )
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

    def get_history(
        self,
        year: int | None = None,
        month: int | None = None,
        employee_id: UUID | None = None,
        status: str | None = None,
        skip: int = 0,
        limit: int = 200,
    ):
        return self.request_repo.get_history(year, month, employee_id, status, skip, limit)

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

    def accrue_monthly(self, actor_employee_id: UUID | None = None) -> dict:
        """Credit each leave type's monthly accrual rate to every active
        employee's balance for the current year. Safe to call more than
        once — a leave type already accrued for the current "YYYY-MM"
        period is skipped, so re-running mid-month (or a duplicate
        scheduler trigger) never double-credits."""
        from app.models.employee import Employee

        today = date.today()
        year = today.year
        period = f"{today.year:04d}-{today.month:02d}"

        leave_types = [lt for lt in self.type_repo.get_all() if lt.last_accrued_period != period]
        if not leave_types:
            return {
                "period": period,
                "leave_types_accrued": [],
                "employees_processed": 0,
                "already_run": True,
            }

        employees = (
            self.db.query(Employee)
            .filter(Employee.company_id == self.company_id, Employee.employment_status == "active")
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

        for lt in leave_types:
            lt.last_accrued_period = period

        log_action(
            self.db, self.company_id, actor_employee_id,
            "leave.accrue_monthly", "leave_type", None,
            details={"period": period, "leave_types": [lt.name for lt in leave_types], "employees_processed": len(employees)},
        )
        self.db.commit()

        return {
            "period": period,
            "leave_types_accrued": [lt.name for lt in leave_types],
            "employees_processed": len(employees),
            "already_run": False,
        }

    def adjust_balance(
        self,
        employee_id: UUID,
        leave_type_id: UUID,
        delta: Decimal,
        reason: str,
        actor_employee_id: UUID | None,
        year: int | None = None,
    ) -> LeaveBalance:
        """Manually add (or subtract) days from one employee's balance —
        for one-off grants, carry-forwards, or corrections outside the
        regular monthly accrual."""
        if year is None:
            year = date.today().year

        balance = self.balance_repo.get_specific(employee_id, leave_type_id, year)
        if balance:
            balance.balance += delta
        else:
            balance = LeaveBalance(
                company_id=self.company_id,
                employee_id=employee_id,
                leave_type_id=leave_type_id,
                balance=max(delta, Decimal(0)),
                year=year,
            )
            self.db.add(balance)

        log_action(
            self.db, self.company_id, actor_employee_id,
            "leave.balance_adjusted", "leave_balance", None,
            details={"employee_id": str(employee_id), "leave_type_id": str(leave_type_id), "delta": str(delta), "reason": reason},
        )
        self.db.commit()
        self.db.refresh(balance)
        return balance
