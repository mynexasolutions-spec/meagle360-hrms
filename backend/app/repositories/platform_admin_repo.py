"""PlatformAdmin repository — no company_id scoping (platform-level accounts)."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.platform_admin import PlatformAdmin


class PlatformAdminRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> PlatformAdmin | None:
        return self.db.query(PlatformAdmin).filter(PlatformAdmin.email == email).first()

    def get_by_id(self, id: UUID) -> PlatformAdmin | None:
        return self.db.query(PlatformAdmin).filter(PlatformAdmin.id == id).first()

    def create(self, data: dict) -> PlatformAdmin:
        admin = PlatformAdmin(**data)
        self.db.add(admin)
        self.db.commit()
        self.db.refresh(admin)
        return admin
