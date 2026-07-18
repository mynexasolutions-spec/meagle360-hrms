"""
Shared FastAPI dependencies.

Key dependency: get_current_user → get_company_id
This is the SINGLE place that enforces company-scoped access.
"""

from uuid import UUID
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user_account import UserAccount
from app.models.platform_admin import PlatformAdmin
from app.services.auth_service import decode_token, PermissionChecker
from app.repositories.user_account_repo import UserAccountRepository
from app.repositories.platform_admin_repo import PlatformAdminRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
platform_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/platform/auth/login")


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
