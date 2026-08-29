"""Company routes — tenant-facing. A tenant can only ever see/edit its OWN
company; new tenants are provisioned exclusively via /api/platform/companies
by Nexa Solutions (see app/routes/platform.py)."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.repositories.company_repo import CompanyRepository
from app.services.cloudinary_service import upload_branding_image
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


@router.post("/branding-image", response_model=CompanyResponse)
async def upload_company_branding_image(
    image_type: str = Query(..., pattern="^(logo|signature)$"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(require_permissions("settings:write")),
):
    """Uploads a logo or signature image to Cloudinary and saves the
    resulting URL directly onto the Company record. Returns the updated
    company so the frontend can immediately show the new image."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    file_bytes = await file.read()
    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 5MB")

    url = upload_branding_image(file_bytes, str(current_user.company_id), image_type)

    field_name = "logo_url" if image_type == "logo" else "signature_url"
    repo = CompanyRepository(db)
    company = repo.update(current_user.company_id, {field_name: url})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company
