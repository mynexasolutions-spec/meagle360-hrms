"""Platform routes — Nexa Solutions staff only. Tenant provisioning + lifecycle.

Entirely separate auth surface from /api/auth/*: platform tokens carry no
company_id and are rejected by every tenant-scoped dependency, and vice versa.
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
import sqlalchemy as sa
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_platform_admin
from app.models.platform_admin import PlatformAdmin
from app.models.company import Company
from app.models.user_account import UserAccount
from app.schemas.platform import (
    PlatformTokenResponse,
    PlatformAdminResponse,
    CompanyCreateRequest,
    CompanyStatusUpdate,
    CompanyUpdateRequest,
    CompanyAdminInviteRequest,
    CompanyAdminInviteResponse,
    PlatformCompanyResponse,
    CompanyUserResponse,
)
from app.services.auth_service import authenticate_platform_admin, create_platform_token
from app.services import platform_service

router = APIRouter(prefix="/api/platform", tags=["Platform (Nexa Solutions)"])


@router.post("/auth/login", response_model=PlatformTokenResponse)
def platform_login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Authenticate a Nexa Solutions platform admin."""
    admin = authenticate_platform_admin(db, form_data.username, form_data.password)
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_platform_token(admin.id)
    return PlatformTokenResponse(access_token=token)


@router.get("/auth/me", response_model=PlatformAdminResponse)
def get_platform_me(
    current_admin: PlatformAdmin = Depends(get_current_platform_admin),
):
    """Get the currently authenticated platform admin's profile."""
    return current_admin


@router.get("/companies", response_model=list[PlatformCompanyResponse])
def list_companies(
    db: Session = Depends(get_db),
    _: PlatformAdmin = Depends(get_current_platform_admin),
):
    """List every tenant on the platform, regardless of status."""
    return db.query(Company).order_by(Company.created_at.desc()).all()


@router.post("/companies", response_model=PlatformCompanyResponse, status_code=201)
def create_company(
    data: CompanyCreateRequest,
    db: Session = Depends(get_db),
    _: PlatformAdmin = Depends(get_current_platform_admin),
):
    """Provision a new tenant (status=pending_setup) with default Admin/Manager/Employee roles."""
    return platform_service.create_company(
        db,
        name=data.name,
        country=data.country,
        multi_entity=data.multi_entity,
        plan_tier=data.plan_tier,
        seat_limit=data.seat_limit,
    )


@router.get("/companies/{company_id}/users", response_model=list[CompanyUserResponse])
def list_company_users(
    company_id: UUID,
    db: Session = Depends(get_db),
    _: PlatformAdmin = Depends(get_current_platform_admin),
):
    """List every user account (admin or otherwise) created under a tenant,
    with their assigned role(s) — so you can see exactly who you invited."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    users = (
        db.query(UserAccount)
        .options(
            joinedload(UserAccount.employee),
            joinedload(UserAccount.role),
            joinedload(UserAccount.role_links),
        )
        .filter(UserAccount.company_id == company_id)
        .order_by(UserAccount.created_at.asc())
        .all()
    )
    return [
        CompanyUserResponse(
            user_account_id=u.id,
            employee_id=u.employee_id,
            email=u.email,
            full_name=u.employee.full_name if u.employee else "",
            employee_code=u.employee.employee_code if u.employee else "",
            role_names=[r.name for r in u.all_roles],
            mfa_enabled=u.mfa_enabled,
            invite_accepted_at=u.invite_accepted_at,
            created_at=u.created_at,
        )
        for u in users
    ]


@router.patch("/companies/{company_id}", response_model=PlatformCompanyResponse)
def update_company(
    company_id: UUID,
    data: CompanyUpdateRequest,
    db: Session = Depends(get_db),
    _: PlatformAdmin = Depends(get_current_platform_admin),
):
    """Edit a tenant's name, country, plan tier, or seat limit."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


@router.delete("/companies/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company(
    company_id: UUID,
    db: Session = Depends(get_db),
    _: PlatformAdmin = Depends(get_current_platform_admin),
):
    """Permanently delete a tenant and everything under it (employees, users,
    attendance, leave, documents, etc.) via the database's own cascading
    foreign keys. Irreversible — the frontend must confirm before calling this.

    Deliberately issues a raw DELETE rather than `db.delete(company)`: the
    ORM's own cascade logic tries to null out child FKs in Python before the
    DB gets a chance to run its ON DELETE CASCADE, which fails for columns
    like user_account.employee_id that are NOT NULL. A single raw DELETE
    lets Postgres handle the entire cascade itself, in the right order.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    db.execute(sa.text("DELETE FROM company WHERE id = :id"), {"id": str(company_id)})
    db.commit()


@router.patch("/companies/{company_id}/status", response_model=PlatformCompanyResponse)
def update_company_status(
    company_id: UUID,
    data: CompanyStatusUpdate,
    db: Session = Depends(get_db),
    _: PlatformAdmin = Depends(get_current_platform_admin),
):
    """Suspend, reactivate, or cancel a tenant."""
    if data.status not in {"active", "suspended", "cancelled"}:
        raise HTTPException(status_code=400, detail="status must be active, suspended, or cancelled")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    company.status = data.status
    db.commit()
    db.refresh(company)
    return company


@router.post(
    "/companies/{company_id}/admin",
    response_model=CompanyAdminInviteResponse,
    status_code=201,
)
def invite_company_admin(
    company_id: UUID,
    data: CompanyAdminInviteRequest,
    db: Session = Depends(get_db),
    _: PlatformAdmin = Depends(get_current_platform_admin),
):
    """Create the first Admin user for a tenant and email them a setup link.
    The invite token is still returned as a fallback to share manually if the
    email fails to send.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    try:
        user, invite_token, email_sent = platform_service.invite_company_admin(
            db,
            company_id=company_id,
            email=data.email,
            full_name=data.full_name,
            employee_code=data.employee_code,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return CompanyAdminInviteResponse(
        user_account_id=user.id,
        email=user.email,
        invite_token=invite_token,
        email_sent=email_sent,
    )


@router.post(
    "/companies/{company_id}/users/{user_account_id}/resend-invite",
    response_model=CompanyAdminInviteResponse,
)
def resend_company_admin_invite(
    company_id: UUID,
    user_account_id: UUID,
    db: Session = Depends(get_db),
    _: PlatformAdmin = Depends(get_current_platform_admin),
):
    """Regenerate an invite token for a company user who hasn't set their
    password yet — for when the original link was lost or expired, without
    needing to re-invite the same email as if it were brand new."""
    try:
        user, invite_token, email_sent = platform_service.resend_company_admin_invite(
            db, company_id=company_id, user_account_id=user_account_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return CompanyAdminInviteResponse(
        user_account_id=user.id,
        email=user.email,
        invite_token=invite_token,
        email_sent=email_sent,
    )
