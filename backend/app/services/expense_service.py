"""Expense service — categories, claim submission, approval, reimbursement."""

from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.expense_category import ExpenseCategory
from app.models.expense_claim import ExpenseClaim
from app.repositories.expense_repo import ExpenseCategoryRepository, ExpenseClaimRepository
from app.services import document_storage
from app.services.audit_service import log_action
from app.services.required_document_service import detect_type

RECEIPT_FOLDER = "receipts"


class ExpenseService:
    def __init__(self, db: Session, company_id: UUID):
        self.category_repo = ExpenseCategoryRepository(db, company_id)
        self.claim_repo = ExpenseClaimRepository(db, company_id)
        self.db = db
        self.company_id = company_id

    # ── Categories ────────────────────────────────────────
    def get_categories(self, include_inactive: bool = False):
        q = self.category_repo._scoped_query()
        if not include_inactive:
            q = q.filter(ExpenseCategory.is_active.is_(True))
        return q.order_by(func.lower(ExpenseCategory.name)).all()

    def _check_unique_name(self, name: str, exclude_id: UUID | None = None) -> None:
        q = self.category_repo._scoped_query().filter(func.lower(ExpenseCategory.name) == name.lower())
        if exclude_id:
            q = q.filter(ExpenseCategory.id != exclude_id)
        if q.first():
            raise ValueError(f'A category named "{name}" already exists')

    def create_category(self, name: str, actor: UUID | None) -> ExpenseCategory:
        name = name.strip()
        if not name:
            raise ValueError("Category name is required")
        self._check_unique_name(name)
        category = ExpenseCategory(company_id=self.company_id, name=name, is_active=True)
        self.db.add(category)
        self.db.flush()
        log_action(self.db, self.company_id, actor, "expense_category.created", "expense_category",
                   category.id, {"title": name})
        self.db.commit()
        self.db.refresh(category)
        return category

    def update_category(self, category_id: UUID, data: dict, actor: UUID | None) -> ExpenseCategory | None:
        """Rename and/or switch on/off. Categories are never deleted, so
        claims filed under them keep showing the name."""
        category = self.category_repo.get_by_id(category_id)
        if not category:
            return None
        if data.get("name") is not None:
            name = data["name"].strip()
            if not name:
                raise ValueError("Category name is required")
            self._check_unique_name(name, exclude_id=category.id)
            category.name = name
        if data.get("is_active") is not None:
            category.is_active = data["is_active"]
        log_action(self.db, self.company_id, actor, "expense_category.updated", "expense_category",
                   category.id, {"title": category.name})
        self.db.commit()
        self.db.refresh(category)
        return category

    # ── Claims ────────────────────────────────────────────
    def submit_claim(self, employee_id: UUID, data: dict, receipt: bytes | None = None,
                     receipt_filename: str | None = None) -> ExpenseClaim:
        if data["amount"] <= 0:
            raise ValueError("Amount must be greater than zero")
        category_id = data.get("category_id")
        if category_id:
            category = self.category_repo.get_by_id(category_id)
            if not category or not category.is_active:
                raise ValueError("Please choose a valid category")

        claim = ExpenseClaim(
            company_id=self.company_id,
            employee_id=employee_id,
            category_id=category_id,
            amount=data["amount"],
            expense_date=data["expense_date"],
            description=data.get("description"),
            status="pending",
        )
        storage_id = None
        if receipt is not None:
            content_type = detect_type(receipt)
            storage_id, storage_path = document_storage.save(
                self.company_id, employee_id, receipt, content_type, subfolder=RECEIPT_FOLDER)
            claim.receipt_filename = (receipt_filename or "receipt")[:200]
            claim.receipt_content_type = content_type
            claim.receipt_storage_id = storage_id
            claim.receipt_storage_path = storage_path
        try:
            self.db.add(claim)
            self.db.flush()
            log_action(self.db, self.company_id, employee_id, "expense.submitted", "expense_claim", claim.id)
            self.db.commit()
        except Exception:
            self.db.rollback()
            if storage_id:
                document_storage.remove(storage_id)
            raise
        self.db.refresh(claim)
        return claim

    def get_claim(self, claim_id: UUID) -> ExpenseClaim | None:
        return self.claim_repo.get_by_id(claim_id)

    @staticmethod
    def receipt_content(claim: ExpenseClaim) -> bytes:
        if not claim.receipt_storage_path:
            raise LookupError("This claim has no uploaded receipt")
        return document_storage.load(claim.receipt_storage_path)

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
