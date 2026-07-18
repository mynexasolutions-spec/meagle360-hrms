"""Announcement repository."""

from uuid import UUID
from sqlalchemy.orm import Session, joinedload

from app.models.announcement import Announcement
from app.repositories.base import BaseRepository


class AnnouncementRepository(BaseRepository[Announcement]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(Announcement, db, company_id)

    def get_recent(self, limit: int = 10) -> list[Announcement]:
        return (
            self._scoped_query()
            .options(joinedload(Announcement.created_by))
            .order_by(Announcement.created_at.desc())
            .limit(limit)
            .all()
        )
