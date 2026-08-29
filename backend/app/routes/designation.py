"""Designation routes — company-scoped job title lookup."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id
from app.repositories.designation_repo import DesignationRepository
from app.schemas.designation import (
    DesignationCreate,
    DesignationUpdate,
    DesignationResponse,
)

router = APIRouter(prefix="/api/designations", tags=["Designations"])


@router.get("/", response_model=list[DesignationResponse])
def list_designations(
    active_only: bool = False,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = DesignationRepository(db, company_id)
    return repo.get_active() if active_only else repo.get_all()


@router.post("/", response_model=DesignationResponse, status_code=201)
def create_designation(
    data: DesignationCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = DesignationRepository(db, company_id)
    return repo.create(data.model_dump())


@router.put("/{designation_id}", response_model=DesignationResponse)
def update_designation(
    designation_id: UUID,
    data: DesignationUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = DesignationRepository(db, company_id)
    designation = repo.update(designation_id, data.model_dump(exclude_unset=True))
    if not designation:
        raise HTTPException(status_code=404, detail="Designation not found")
    return designation


@router.delete("/{designation_id}", status_code=204)
def delete_designation(
    designation_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = DesignationRepository(db, company_id)
    if not repo.delete(designation_id):
        raise HTTPException(status_code=404, detail="Designation not found")
