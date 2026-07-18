"""Company repository — no company_id scoping (it IS the root entity)."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.company import Company


class CompanyRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self, skip: int = 0, limit: int = 100) -> list[Company]:
        return self.db.query(Company).offset(skip).limit(limit).all()

    def get_by_id(self, id: UUID) -> Company | None:
        return self.db.query(Company).filter(Company.id == id).first()

    def create(self, data: dict) -> Company:
        company = Company(**data)
        self.db.add(company)
        self.db.commit()
        self.db.refresh(company)
        return company

    def update(self, id: UUID, data: dict) -> Company | None:
        company = self.get_by_id(id)
        if not company:
            return None
        for key, value in data.items():
            if value is not None:
                setattr(company, key, value)
        self.db.commit()
        self.db.refresh(company)
        return company
