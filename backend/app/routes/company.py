"""Company routes — tenant-facing. A tenant can only ever see/edit its OWN
company; new tenants are provisioned exclusively via /api/platform/companies
by Nexa Solutions (see app/routes/platform.py)."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.repositories.company_repo import CompanyRepository
from app.schemas.company import CompanyUpdate, CompanyResponse

router = APIRouter(prefix="/api/companies", tags=["Companies"])


@router.get("/me", response_model=CompanyResponse)
def get_my_company(
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    repo = CompanyRepository(db)
    company = repo.get_by_id(current_user.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.put("/me", response_model=CompanyResponse)
def update_my_company(
    data: CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(require_permissions("settings:write")),
):
    repo = CompanyRepository(db)
    company = repo.update(current_user.company_id, data.model_dump(exclude_unset=True))
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company
