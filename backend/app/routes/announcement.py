"""Announcement routes — company notice board."""

from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.repositories.announcement_repo import AnnouncementRepository
from app.schemas.announcement import AnnouncementCreate, AnnouncementResponse
from app.services.audit_service import log_action

router = APIRouter(prefix="/api/announcements", tags=["Announcements"])


@router.get("/", response_model=list[AnnouncementResponse])
def list_announcements(
    limit: int = 10,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = AnnouncementRepository(db, company_id)
    announcements = repo.get_recent(limit)
    return [
        AnnouncementResponse(
            id=a.id,
            title=a.title,
            body=a.body,
            created_by_name=a.created_by.full_name if a.created_by else None,
            created_at=a.created_at,
        )
        for a in announcements
    ]


@router.post("/", response_model=AnnouncementResponse, status_code=201)
def create_announcement(
    data: AnnouncementCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("settings:write")),
):
    repo = AnnouncementRepository(db, company_id)
    announcement = repo.create({
        **data.model_dump(),
        "created_by_employee_id": current_user.employee_id,
    })
    log_action(db, company_id, current_user.employee_id, "announcement.created", "announcement", announcement.id)
    db.commit()
    return AnnouncementResponse(
        id=announcement.id,
        title=announcement.title,
        body=announcement.body,
        created_by_name=current_user.employee.full_name if current_user.employee else None,
        created_at=announcement.created_at,
    )
