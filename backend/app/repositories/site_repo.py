"""Site repository."""

from uuid import UUID
from sqlalchemy.orm import Session

from app.models.site import Site
from app.repositories.base import BaseRepository


class SiteRepository(BaseRepository[Site]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(Site, db, company_id)
