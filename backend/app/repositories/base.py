"""
Generic CRUD repository with automatic company_id scoping.

Every query is filtered by company_id — this is the single shared
dependency that enforces multi-tenancy at the data-access layer.
"""

from typing import TypeVar, Generic, Type
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.base import Base

T = TypeVar("T", bound=Base)


class BaseRepository(Generic[T]):
    """Company-scoped generic CRUD repository."""

    def __init__(self, model: Type[T], db: Session, company_id: UUID):
        self.model = model
        self.db = db
        self.company_id = company_id

    def _scoped_query(self):
        """Every query automatically filtered by company_id."""
        return self.db.query(self.model).filter(
            self.model.company_id == self.company_id
        )

    def get_all(self, skip: int = 0, limit: int = 100) -> list[T]:
        return self._scoped_query().offset(skip).limit(limit).all()

    def get_by_id(self, id: UUID) -> T | None:
        return self._scoped_query().filter(self.model.id == id).first()

    def create(self, data: dict) -> T:
        data["company_id"] = self.company_id
        instance = self.model(**data)
        self.db.add(instance)
        self.db.commit()
        self.db.refresh(instance)
        return instance

    def update(self, id: UUID, data: dict) -> T | None:
        instance = self.get_by_id(id)
        if not instance:
            return None
        for key, value in data.items():
            if value is not None:
                setattr(instance, key, value)
        self.db.commit()
        self.db.refresh(instance)
        return instance

    def delete(self, id: UUID) -> bool:
        instance = self.get_by_id(id)
        if not instance:
            return False
        self.db.delete(instance)
        self.db.commit()
        return True

    def count(self) -> int:
        return self._scoped_query().count()
