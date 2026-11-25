"""Required documents: settings:write keeps the list, HR reviews, employees upload their own."""

import logging
from contextlib import contextmanager
from typing import Literal
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import (
    get_company_id, get_current_user, has_any_permission, require_any_permission, require_permissions,
)
from app.models.user_account import UserAccount
from app.services.document_storage import StorageError
from app.services.required_document_service import MAX_FILE_BYTES, DocumentConflict, RequiredDocumentService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["Required documents"])
# Managers are left out on purpose: these are ID proofs.
HR_PERMISSIONS = ("employees:write", "settings:write")
hr = require_any_permission(HR_PERMISSIONS)
admin = require_permissions("settings:write")


class RequiredIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    instructions: str = Field(default="", max_length=300)
    mandatory: bool = True
    department_ids: list[UUID] = Field(default_factory=list, max_length=200)
    employment_types: list[Literal["full_time", "fixed_term", "contractor", "intern"]] = Field(
        default_factory=list, max_length=4)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name is required")
        return value

    def values(self) -> dict:
        data = self.model_dump()
        data["department_ids"] = [str(i) for i in self.department_ids]
        return data


class ArchiveIn(BaseModel):
    archived: bool


class ReviewIn(BaseModel):
    decision: Literal["verified", "rejected"]
    note: str = Field(default="", max_length=300)


def service(db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id)) -> RequiredDocumentService:
    return RequiredDocumentService(db, company_id)


@contextmanager
def document_errors():
    try:
        yield
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except DocumentConflict as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except StorageError as e:
        logger.error("Employee document storage failed: %s", e)
        raise HTTPException(status_code=502, detail="File storage is not responding. Please try again.")


def self_or_hr(user: UserAccount, employee_id: UUID) -> bool:
    """True when acting as HR. Refuses anyone who is neither HR nor the employee."""
    is_hr = has_any_permission(user, HR_PERMISSIONS)
    if not is_hr and user.employee_id != employee_id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return is_hr


def file_response(content: bytes, content_type: str, filename: str) -> Response:
    return Response(content, media_type=content_type, headers={
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}",
        "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
    })


@router.get("/pending-count")
def pending_count(svc: RequiredDocumentService = Depends(service), user: UserAccount = Depends(get_current_user)):
    with document_errors():
        return {"count": svc.pending_count(user.employee_id)}


@router.get("/required")
def list_required(svc: RequiredDocumentService = Depends(service), _: UserAccount = Depends(admin)):
    return svc.list_required()


@router.post("/required", status_code=201)
def create_required(data: RequiredIn, svc: RequiredDocumentService = Depends(service),
                    user: UserAccount = Depends(admin)):
    with document_errors():
        return svc.save(data.values(), user.employee_id)


@router.put("/required/{doc_id}")
def update_required(doc_id: UUID, data: RequiredIn, svc: RequiredDocumentService = Depends(service),
                    user: UserAccount = Depends(admin)):
    with document_errors():
        return svc.save(data.values(), user.employee_id, doc_id)


@router.post("/required/{doc_id}/archive")
def archive_required(doc_id: UUID, data: ArchiveIn, svc: RequiredDocumentService = Depends(service),
                     user: UserAccount = Depends(admin)):
    with document_errors():
        return svc.set_archived(doc_id, data.archived, user.employee_id)


@router.get("/overview")
def overview(svc: RequiredDocumentService = Depends(service), _: UserAccount = Depends(hr)):
    return svc.overview()


@router.get("/employees/{employee_id}")
def checklist(employee_id: UUID, svc: RequiredDocumentService = Depends(service),
              user: UserAccount = Depends(get_current_user)):
    self_or_hr(user, employee_id)
    with document_errors():
        return svc.checklist(employee_id)


@router.post("/employees/{employee_id}/{doc_id}", status_code=204)
def upload(employee_id: UUID, doc_id: UUID, file: UploadFile = File(...),
           svc: RequiredDocumentService = Depends(service), user: UserAccount = Depends(get_current_user)):
    is_hr = self_or_hr(user, employee_id)
    content = file.file.read(MAX_FILE_BYTES + 1)
    with document_errors():
        svc.upload(employee_id, doc_id, (file.filename or "document")[:200], content, user.employee_id, is_hr)


@router.get("/files/{file_id}")
def get_file(file_id: UUID, svc: RequiredDocumentService = Depends(service),
             user: UserAccount = Depends(get_current_user)):
    with document_errors():
        f = svc.file(file_id)
    self_or_hr(user, f.employee_id)
    with document_errors():
        content = svc.content(f)
    return file_response(content, f.content_type, f.filename)


@router.post("/files/{file_id}/review", status_code=204)
def review(file_id: UUID, data: ReviewIn, svc: RequiredDocumentService = Depends(service),
           user: UserAccount = Depends(hr)):
    with document_errors():
        svc.review(file_id, data.decision, data.note.strip(), user.employee_id)
