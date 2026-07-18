"""Auth routes — login, register, token refresh, current user."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.schemas.platform import SetPasswordRequest
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    register_user,
    set_password_from_invite,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Authenticate with email + password, receive JWT."""
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(user.id, user.company_id, user.role_id)
    return TokenResponse(access_token=token)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    data: RegisterRequest,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(require_permissions("employees:write")),
):
    """Register a new employee + user account with a caller-supplied password.

    Restricted to Admins/HR (employees:write) and always scoped to the
    caller's own company — the client-supplied company_id is ignored so an
    Admin can never provision an account into another tenant. Prefer
    POST /api/employees/invite for the normal flow (invite link, no shared
    plaintext password); this endpoint remains for callers that need to set
    the password directly.
    """
    try:
        user = register_user(
            db=db,
            email=data.email,
            password=data.password,
            full_name=data.full_name,
            employee_code=data.employee_code,
            company_id=current_user.company_id,
            role_id=data.role_id,
        )
        return UserResponse(
            id=user.id,
            email=user.email,
            employee_id=user.employee_id,
            company_id=user.company_id,
            role_id=user.role_id,
            mfa_enabled=user.mfa_enabled,
            full_name=data.full_name,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/set-password", status_code=status.HTTP_200_OK)
def set_password(data: SetPasswordRequest, db: Session = Depends(get_db)):
    """Redeem an invite token (sent when a company admin is created by Nexa
    Solutions) to set a real password. Activates the company on first use."""
    try:
        set_password_from_invite(db, data.token, data.new_password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"message": "Password set successfully. You can now log in."}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: UserAccount = Depends(get_current_user)):
    """Get the currently authenticated user's profile."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        employee_id=current_user.employee_id,
        company_id=current_user.company_id,
        role_id=current_user.role_id,
        mfa_enabled=current_user.mfa_enabled,
        full_name=current_user.employee.full_name if current_user.employee else None,
        role_name=current_user.role.name if current_user.role else None,
        permissions=current_user.merged_permissions,
    )
