"""Expense service — categories, claim submission, approval, reimbursement."""

from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.expense_claim import ExpenseClaim
from app.repositories.expense_repo import ExpenseCategoryRepository, ExpenseClaimRepository
from app.services.audit_service import log_action


class ExpenseService:
    def __init__(self, db: Session, company_id: UUID):
        self.category_repo = ExpenseCategoryRepository(db, company_id)
        self.claim_repo = ExpenseClaimRepository(db, company_id)
        self.db = db
        self.company_id = company_id

    # ── Categories ────────────────────────────────────────
    def get_categories(self):
        return self.category_repo.get_all()

    def create_category(self, data: dict):
        return self.category_repo.create(data)

    # ── Claims ────────────────────────────────────────────
    def submit_claim(self, employee_id: UUID, data: dict) -> ExpenseClaim:
        claim = ExpenseClaim(
            company_id=self.company_id,
            employee_id=employee_id,
            category_id=data.get("category_id"),
            amount=data["amount"],
            expense_date=data["expense_date"],
            description=data.get("description"),
            receipt_url=data.get("receipt_url"),
            status="pending",
        )
        self.db.add(claim)
        log_action(self.db, self.company_id, employee_id, "expense.submitted", "expense_claim", claim.id)
        self.db.commit()
        self.db.refresh(claim)
        return claim

    def get_my_claims(self, employee_id: UUID, skip=0, limit=50):
        return self.claim_repo.get_by_employee(employee_id, skip, limit)

    def get_pending_claims(self, skip=0, limit=50):
        return self.claim_repo.get_pending(skip, limit)

    def get_all_claims(self, skip=0, limit=100):
        return self.claim_repo.get_all(skip, limit)

    def count_pending(self) -> int:
        return self.claim_repo.count_pending()

    def approve_reject(self, claim_id: UUID, status: str, reviewer_employee_id: UUID) -> ExpenseClaim | None:
        claim = self.claim_repo.get_by_id(claim_id)
        if not claim:
            return None
        if claim.status != "pending":
            raise ValueError(f"Claim is already {claim.status}")

        claim.status = status
        claim.reviewed_by_employee_id = reviewer_employee_id
        claim.reviewed_at = datetime.now(timezone.utc)

        log_action(
            self.db, self.company_id, reviewer_employee_id,
            f"expense.{status}", "expense_claim", claim.id,
        )
        self.db.commit()
        self.db.refresh(claim)
        return claim

    def mark_reimbursed(self, claim_id: UUID, actor_employee_id: UUID) -> ExpenseClaim | None:
        claim = self.claim_repo.get_by_id(claim_id)
        if not claim:
            return None
        if claim.status != "approved":
            raise ValueError("Only approved claims can be marked reimbursed")

        claim.status = "reimbursed"
        claim.reimbursed_at = datetime.now(timezone.utc)

        log_action(
            self.db, self.company_id, actor_employee_id,
            "expense.reimbursed", "expense_claim", claim.id,
        )
        self.db.commit()
        self.db.refresh(claim)
        return claim
