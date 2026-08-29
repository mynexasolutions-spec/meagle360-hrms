"""OfferLetterRecord repository."""

from sqlalchemy.orm import Session
from uuid import UUID

from app.models.offer_letter_record import OfferLetterRecord
from app.repositories.base import BaseRepository


class OfferLetterRepository(BaseRepository[OfferLetterRecord]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(OfferLetterRecord, db, company_id)
