"""Notification repository."""

from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.notification import Notification
from app.repositories.base import BaseRepository


class NotificationRepository(BaseRepository[Notification]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(Notification, db, company_id)

    def get_for_employee(
        self,
        employee_id: UUID,
        unread_only: bool = False,
        skip: int = 0,
        limit: int = 50,
    ):
        query = self._scoped_query().filter(
            Notification.recipient_employee_id == employee_id
        )
        if unread_only:
            query = query.filter(Notification.is_read == False)
        return (
            query.order_by(Notification.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def count_unread(self, employee_id: UUID) -> int:
        return (
            self._scoped_query()
            .filter(
                Notification.recipient_employee_id == employee_id,
                Notification.is_read == False,
            )
            .count()
        )

    def mark_read(self, notification_id: UUID, employee_id: UUID):
        notif = (
            self._scoped_query()
            .filter(
                Notification.id == notification_id,
                Notification.recipient_employee_id == employee_id,
            )
            .first()
        )
        if not notif:
            return None
        notif.is_read = True
        notif.read_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(notif)
        return notif

    def mark_all_read(self, employee_id: UUID) -> int:
        rows = (
            self._scoped_query()
            .filter(
                Notification.recipient_employee_id == employee_id,
                Notification.is_read == False,
            )
            .update(
                {
                    "is_read": True,
                    "read_at": datetime.now(timezone.utc),
                },
                synchronize_session=False,
            )
        )
        self.db.commit()
        return rows
