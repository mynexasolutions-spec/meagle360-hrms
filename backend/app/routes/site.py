"""Site routes — physical work locations/branches employees register under."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, require_permissions
from app.repositories.site_repo import SiteRepository
from app.schemas.site import SiteCreate, SiteUpdate, SiteResponse

router = APIRouter(prefix="/api/sites", tags=["Sites"])


@router.get("/", response_model=list[SiteResponse])
def list_sites(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = SiteRepository(db, company_id)
    return repo.get_all()


@router.post("/", response_model=SiteResponse, status_code=201)
def create_site(
    data: SiteCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("employees:write")),
):
    repo = SiteRepository(db, company_id)
    return repo.create(data.model_dump())


@router.put("/{site_id}", response_model=SiteResponse)
def update_site(
    site_id: UUID,
    data: SiteUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("employees:write")),
):
    repo = SiteRepository(db, company_id)
    site = repo.update(site_id, data.model_dump(exclude_unset=True))
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site


@router.delete("/{site_id}", status_code=204)
def delete_site(
    site_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("employees:write")),
):
    repo = SiteRepository(db, company_id)
    if not repo.delete(site_id):
        raise HTTPException(status_code=404, detail="Site not found")
