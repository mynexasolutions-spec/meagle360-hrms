"""Designation routes — company-scoped job title lookup."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, require_permissions
from app.models.designation import Designation
from app.models.employee import Employee
from app.models.user_account import UserAccount
from app.repositories.designation_repo import DesignationRepository
from app.schemas.designation import (
    DesignationCreate,
    DesignationUpdate,
    DesignationResponse,
)

router = APIRouter(prefix="/api/designations", tags=["Designations"])


def _clean_title(db: Session, company_id: UUID, title: str, own_id: UUID | None = None) -> str:
    title = title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Enter a title")
    others = db.query(Designation.id, Designation.title).filter(Designation.company_id == company_id).all()
    if any(t.lower() == title.lower() and i != own_id for i, t in others):
        raise HTTPException(status_code=400, detail="A designation with this title already exists")
    return title


@router.get("/", response_model=list[DesignationResponse])
def list_designations(
    active_only: bool = False,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = DesignationRepository(db, company_id)
    return repo.get_active() if active_only else repo.get_all(limit=1000)


@router.post("/", response_model=DesignationResponse, status_code=201)
def create_designation(
    data: DesignationCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("settings:write")),
):
    repo = DesignationRepository(db, company_id)
    return repo.create({**data.model_dump(), "title": _clean_title(db, company_id, data.title)})


@router.put("/{designation_id}", response_model=DesignationResponse)
def update_designation(
    designation_id: UUID,
    data: DesignationUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("settings:write")),
):
    repo = DesignationRepository(db, company_id)
    fields = data.model_dump(exclude_unset=True)
    if fields.get("title") is not None:
        fields["title"] = _clean_title(db, company_id, fields["title"], designation_id)
    designation = repo.update(designation_id, fields)
    if not designation:
        raise HTTPException(status_code=404, detail="Designation not found")
    return designation


@router.delete("/{designation_id}", status_code=204)
def delete_designation(
    designation_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("settings:write")),
):
    repo = DesignationRepository(db, company_id)
    in_use = (
        db.query(Employee.id)
        .filter(Employee.company_id == company_id, Employee.designation_id == designation_id)
        .first()
    )
    if in_use:
        raise HTTPException(status_code=409, detail="Employees still hold this designation. Change theirs first.")
    if not repo.delete(designation_id):
        raise HTTPException(status_code=404, detail="Designation not found")
