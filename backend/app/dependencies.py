"""
Shared FastAPI dependencies.

Key dependency: get_current_user → get_company_id
This is the SINGLE place that enforces company-scoped access.
"""
from fastapi import Depends, HTTPException, status, Request
from uuid import UUID
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.models.company import Company
from app.services.subdomain_service import RESERVED_SUBDOMAINS
from app.database import get_db
from app.models.user_account import UserAccount
from app.models.platform_admin import PlatformAdmin
from app.services.auth_service import decode_token, PermissionChecker
from app.repositories.user_account_repo import UserAccountRepository
from app.repositories.platform_admin_repo import PlatformAdminRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
platform_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/platform/auth/login")


def _check_plan_not_expired(db: Session, company_id: UUID) -> None:
    """Single place both login and every in-session request funnel
    through to enforce plan expiry. Raises a 402 with a machine-readable
    error_code so the frontend can reliably show the plan-ended screen
    instead of a generic error."""
    from datetime import datetime, timezone

    company = db.query(Company).filter(Company.id == company_id).first()
    if company is None:
        return
    if company.plan_ends_at is None:
        return
    if company.plan_ends_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error_code": "plan_expired",
                "message": "Your plan has ended. Purchase a plan to continue.",
            },
        )


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> UserAccount:
    """Decode JWT and return the authenticated tenant user (Admin/Manager/Employee)."""
    payload = decode_token(token)
    if not payload or payload.get("type") != "tenant":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = UserAccountRepository.get_by_id_global(db, UUID(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # NOTE: plan-expiry enforcement is NOT done here. It is handled by
    # PlanExpiryMiddleware (app/middleware/plan_expiry.py), which allows
    # login + a small allowlist of routes (subscription status, /auth/me,
    # logout) even when the plan has expired, and blocks everything else.
    # A hard block here would also block those allowlisted routes.
    return user


def get_current_platform_admin(
    token: str = Depends(platform_oauth2_scheme),
    db: Session = Depends(get_db),
) -> PlatformAdmin:
    """Decode JWT and return the authenticated Nexa Solutions platform admin.
    Entirely separate from get_current_user so a tenant token can never grant
    platform access (and vice versa)."""
    payload = decode_token(token)
    if not payload or payload.get("type") != "platform":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired platform token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    admin_id = payload.get("sub")
    if not admin_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    admin = PlatformAdminRepository(db).get_by_id(UUID(admin_id))
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Platform admin not found",
        )
    return admin


def get_company_id(
    current_user: UserAccount = Depends(get_current_user),
) -> UUID:
    """
    Single place that resolves company_id from the authenticated user.
    Every route that needs scoped data depends on this.
    """
    return current_user.company_id


def require_admin_role():
    """Dependency — unlike require_permissions (any role holding a
    permission flag), this checks the user's actual role name is "Admin",
    for actions explicitly restricted to Admins only (e.g. attendance
    regularization approval), regardless of what permission flags a
    Manager/HR Manager role happens to carry."""
    def _check(current_user: UserAccount = Depends(get_current_user)):
        if not any(r.name == "Admin" for r in current_user.all_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin only",
            )
        return current_user

    return _check


def require_permissions(*permissions: str):
    """
    Dependency factory — checks that the current user has all
    the specified permissions in their role.permissions JSON.
    """
    checker = PermissionChecker(list(permissions))

    def _check(current_user: UserAccount = Depends(get_current_user)):
        if not checker(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _check

def get_company_from_subdomain(request: Request, db: Session = Depends(get_db)) -> Company | None:
    """
    Resolve the tenant Company from the request's subdomain, e.g.
    "abc-corp.meagle360.com" -> Company(subdomain="abc-corp").

    Returns None when the request comes in on the bare root domain
    (meagle360.com, hrms.meagle360.com) or from localhost during local
    development — callers decide whether that's acceptable for their route.
    """
    host = request.headers.get("host", "")
    # Strip port if present, e.g. "abc-corp.meagle360.com:8000"
    host = host.split(":")[0]

    parts = host.split(".")
    # A real tenant subdomain looks like "abc-corp.meagle360.com" (3 parts).
    # "meagle360.com" (2 parts) or "localhost" (1 part) is not a tenant request.
    if len(parts) < 3:
        return None

    subdomain = parts[0]
    if subdomain in RESERVED_SUBDOMAINS:
        return None

    return db.query(Company).filter(Company.subdomain == subdomain).first()
