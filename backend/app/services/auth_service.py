"""
Authentication service — password hashing, JWT tokens, permission checks.

Auth mechanism (JWT) is decoupled from permission logic (PermissionChecker),
so swapping to Supabase Auth later only means replacing token verification.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.employee import Employee
from app.models.user_account import UserAccount
from app.models.role import Role
from app.models.platform_admin import PlatformAdmin
from app.repositories.user_account_repo import UserAccountRepository
from app.repositories.employee_repo import EmployeeRepository
from app.repositories.platform_admin_repo import PlatformAdminRepository

INVITE_TOKEN_EXPIRE_HOURS = 48

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(
    user_id: UUID,
    company_id: UUID,
    role_id: UUID | None = None,
) -> str:
    """Tenant-scoped token — used by company Admin/Manager/Employee users."""
    payload = {
        "type": "tenant",
        "sub": str(user_id),
        "company_id": str(company_id),
        "role_id": str(role_id) if role_id else None,
        "exp": datetime.now(timezone.utc)
        + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_platform_token(admin_id: UUID) -> str:
    """Platform-scoped token — used by Nexa Solutions staff. Carries no company_id,
    so it can never be mistaken for tenant access by company-scoped dependencies."""
    payload = {
        "type": "platform",
        "sub": str(admin_id),
        "exp": datetime.now(timezone.utc)
        + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_invite_token(user_account_id: UUID) -> str:
    """Short-lived, single-purpose token e-mailed to a newly invited company admin
    so they can set their own password. Cannot be used as an access token —
    dependencies only accept type == 'tenant' or 'platform'."""
    payload = {
        "type": "invite",
        "sub": str(user_account_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=INVITE_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError:
        return None


def register_user(
    db: Session,
    email: str,
    password: str,
    full_name: str,
    employee_code: str,
    company_id: UUID,
    role_id: UUID | None = None,
) -> UserAccount:
    """Register a new employee + user account."""
    # Create employee first
    employee = Employee(
        company_id=company_id,
        full_name=full_name,
        employee_code=employee_code,
        date_of_hire=datetime.now(timezone.utc).date(),
        employment_status="active",
    )
    db.add(employee)
    db.flush()

    # Create user account
    user = UserAccount(
        company_id=company_id,
        employee_id=employee.id,
        role_id=role_id,
        email=email,
        password_hash=hash_password(password),
        mfa_enabled=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> UserAccount | None:
    """Verify email + password, return user if valid."""
    user = UserAccountRepository.get_by_email_global(db, email)
    if not user or not verify_password(password, user.password_hash):
        return None
    return user


def authenticate_platform_admin(db: Session, email: str, password: str) -> PlatformAdmin | None:
    """Verify email + password for a Nexa Solutions platform admin."""
    admin = PlatformAdminRepository(db).get_by_email(email)
    if not admin or not verify_password(password, admin.password_hash):
        return None
    return admin


def set_password_from_invite(db: Session, token: str, new_password: str) -> UserAccount:
    """Redeem an invite token: sets the real password and activates the account's company
    if it was still pending setup."""
    payload = decode_token(token)
    if not payload or payload.get("type") != "invite":
        raise ValueError("Invalid or expired invite token")

    user = UserAccountRepository.get_by_id_global(db, UUID(payload["sub"]))
    if not user:
        raise ValueError("Invite is no longer valid")

    user.password_hash = hash_password(new_password)
    user.invite_accepted_at = datetime.now(timezone.utc)

    from app.models.company import Company
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if company and company.status == "pending_setup":
        company.status = "active"

    db.commit()
    db.refresh(user)
    return user


class PermissionChecker:
    """
    Decoupled permission checker — reads the union of permissions across
    all roles held by the account (primary role + any additional roles).
    For an account with only a primary role — every account today — this
    is identical to reading role.permissions alone.
    Does NOT care how the user was authenticated (JWT, Supabase Auth, etc.).
    """

    def __init__(self, required_permissions: list[str]):
        self.required = required_permissions

    def __call__(self, user: UserAccount) -> bool:
        if not user.all_roles:
            return False
        user_perms = user.merged_permissions
        return all(user_perms.get(p, False) for p in self.required)
