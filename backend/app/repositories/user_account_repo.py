"""UserAccount repository for auth lookups."""

from uuid import UUID
from sqlalchemy.orm import Session, joinedload

from app.models.user_account import UserAccount
from app.repositories.base import BaseRepository


class UserAccountRepository(BaseRepository[UserAccount]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(UserAccount, db, company_id)

    def get_by_email(self, email: str) -> UserAccount | None:
        """Lookup by email — used during login (scoped to company)."""
        return (
            self._scoped_query()
            .options(joinedload(UserAccount.role), joinedload(UserAccount.employee))
            .filter(UserAccount.email == email)
            .first()
        )

    @staticmethod
    def get_by_email_global(db: Session, email: str) -> UserAccount | None:
        """Lookup by email across all companies — used during login
        when company_id isn't known yet."""
        return (
            db.query(UserAccount)
            .options(joinedload(UserAccount.role), joinedload(UserAccount.employee))
            .filter(UserAccount.email == email)
            .first()
        )

    @staticmethod
    def get_by_id_global(db: Session, user_id: UUID) -> UserAccount | None:
        """Lookup by ID across all companies — used for JWT verification."""
        return (
            db.query(UserAccount)
            .options(joinedload(UserAccount.role), joinedload(UserAccount.employee))
            .filter(UserAccount.id == user_id)
            .first()
        )
