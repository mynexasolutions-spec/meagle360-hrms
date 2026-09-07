"""
Platform service — Nexa Solutions tenant-provisioning logic.

Only platform admins call into this. A company created here starts in
"pending_setup" until its invited Admin sets a real password, at which
point the invite redemption (auth_service.set_password_from_invite)
flips it to "active".
"""

import secrets
import uuid
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.role import Role
from app.models.employee import Employee
from app.models.user_account import UserAccount
from app.models.expense_category import ExpenseCategory
from app.models.leave_type import LeaveType
from app.models.salary_component import SalaryComponent
from app.services.auth_service import hash_password, create_invite_token
from app.services.email_service import try_send_invite_email
from app.services.subdomain_service import generate_unique_subdomain

DEFAULT_EXPENSE_CATEGORIES = ["Travel", "Meals & Entertainment", "Office Supplies", "Transportation", "Other"]

VALID_PLAN_TIERS = {"trial", "quarterly", "half_yearly", "yearly"}
# Fixed month offsets for tiers with a set duration. "trial" is deliberately
# absent here — its length is a custom, admin-supplied number of days rather
# than a fixed offset.
PLAN_TIER_MONTHS = {"quarterly": 3, "half_yearly": 6, "yearly": 12}


def compute_plan_ends_at(plan_tier: str, trial_days: int | None) -> datetime:
    """Compute the plan expiry timestamp for a given tier.

    trial: caller-supplied custom day count (required, must be positive).
    quarterly/half_yearly/yearly: fixed month offset from now, ignores
    trial_days even if the caller passes one.
    """
    if plan_tier not in VALID_PLAN_TIERS:
        valid = sorted(VALID_PLAN_TIERS)
        raise ValueError("Invalid plan_tier: " + repr(plan_tier) + ". Must be one of " + str(valid))

    now = datetime.now(timezone.utc)

    if plan_tier == "trial":
        if trial_days is None or trial_days <= 0:
            raise ValueError("trial_days must be a positive integer when plan_tier is 'trial'")
        from datetime import timedelta
        return now + timedelta(days=trial_days)

    months = PLAN_TIER_MONTHS[plan_tier]
    return now + relativedelta(months=months)

# (name, component_type, calculation_type, value, is_statutory, is_taxable, display_order)
DEFAULT_INDIA_SALARY_COMPONENTS = [
    ("HRA", "earning", "percent_of_basic", 40.0, False, True, 10),
    ("Conveyance Allowance", "earning", "fixed", 1600.0, False, False, 20),
    ("Special Allowance", "earning", "fixed", 0.0, False, True, 30),
    ("EPF (Employee Provident Fund)", "deduction", "percent_of_basic", 12.0, True, False, 10),
    ("ESI (Employee State Insurance)", "deduction", "percent_of_gross", 0.75, True, False, 20),
    ("Professional Tax", "deduction", "fixed", 200.0, True, False, 30),
    ("TDS (Income Tax)", "deduction", "fixed", 0.0, True, False, 40),
]

DEFAULT_ROLE_PERMISSIONS = {
    "Admin": {
        "employees:read": True, "employees:write": True,
        "attendance:read": True, "attendance:write": True, "attendance:approve": True,
        "leave:read": True, "leave:write": True, "leave:approve": True,
        "shifts:read": True, "shifts:write": True,
        "settings:read": True, "settings:write": True,
        "expenses:read": True, "expenses:write": True, "expenses:approve": True,
        "payroll:read": True, "payroll:write": True, "payroll:approve": True,
    },
    "Manager": {
        "employees:read": True,
        "attendance:read": True, "attendance:write": True, "attendance:approve": True,
        "leave:read": True, "leave:approve": True,
        "shifts:read": True,
        "expenses:read": True, "expenses:approve": True,
    },
    "Employee": {
        "employees:read": True,
        "attendance:read": True, "attendance:write": True,
        "leave:read": True, "leave:write": True,
        "expenses:read": True, "expenses:write": True,
    },
    "HR Manager": {
        "employees:read": True, "employees:write": True,
        "attendance:read": True, "attendance:write": True, "attendance:approve": True,
        "leave:read": True, "leave:write": True, "leave:approve": True,
        "expenses:read": True, "expenses:write": True, "expenses:approve": True,
    },
    "Expense Manager": {
        "employees:read": True,
        "attendance:read": True, "attendance:write": True,
        "leave:read": True, "leave:write": True,
        "expenses:read": True, "expenses:write": True, "expenses:approve": True,
    },
    "Helpdesk Manager": {
        "employees:read": True,
        "attendance:read": True, "attendance:write": True,
        "leave:read": True, "leave:write": True,
        "helpdesk:read": True, "helpdesk:write": True, "helpdesk:manage": True,
    },
    "Project Admin": {
        "employees:read": True,
        "attendance:read": True, "attendance:write": True,
        "leave:read": True, "leave:write": True,
        "projects:read": True, "projects:write": True, "projects:manage": True,
    },
    "Payroll Manager": {
        "employees:read": True,
        "payroll:read": True, "payroll:write": True, "payroll:approve": True,
    },
}


def create_company(
    db: Session,
    name: str,
    country: str | None,
    multi_entity: bool,
    plan_tier: str,
    seat_limit: int | None,
    trial_days: int | None = None,
) -> Company:
    """Create a new tenant, pending setup, with its default role set seeded."""
    subdomain = generate_unique_subdomain(name, db)
    plan_ends_at = compute_plan_ends_at(plan_tier, trial_days)
    company = Company(
        id=uuid.uuid4(),
        name=name,
        subdomain=subdomain,
        country=country,
        multi_entity=multi_entity,
        status="pending_setup",
        plan_tier=plan_tier,
        plan_ends_at=plan_ends_at,
        seat_limit=seat_limit,
    )
    db.add(company)
    db.flush()

    for role_name, permissions in DEFAULT_ROLE_PERMISSIONS.items():
        db.add(Role(id=uuid.uuid4(), company_id=company.id, name=role_name, permissions=permissions))

    for category_name in DEFAULT_EXPENSE_CATEGORIES:
        db.add(ExpenseCategory(id=uuid.uuid4(), company_id=company.id, name=category_name))

    for name, ctype, calc, value, statutory, taxable, order in DEFAULT_INDIA_SALARY_COMPONENTS:
        db.add(SalaryComponent(
            id=uuid.uuid4(), company_id=company.id, name=name,
            component_type=ctype, calculation_type=calc, value=value,
            is_statutory=statutory, is_taxable=taxable, is_active=True, display_order=order,
        ))

    db.add(LeaveType(id=uuid.uuid4(), company_id=company.id, name="Loss of Pay", accrual_rate=0, is_paid=False))

    db.commit()
    db.refresh(company)
    return company


def invite_company_admin(
    db: Session,
    company_id: UUID,
    email: str,
    full_name: str,
    employee_code: str,
) -> tuple[UserAccount, str, bool]:
    """Create the first Admin employee + user account for a company and
    return an invite token for them to set their own password."""
    admin_role = (
        db.query(Role)
        .filter(Role.company_id == company_id, Role.name == "Admin")
        .first()
    )
    if not admin_role:
        raise ValueError("Company has no Admin role — was it created via create_company()?")

    existing = db.query(UserAccount).filter(UserAccount.email == email).first()
    if existing:
        raise ValueError(f"A user with email {email} already exists")

    employee = Employee(
        id=uuid.uuid4(),
        company_id=company_id,
        full_name=full_name,
        employee_code=employee_code,
        date_of_hire=datetime.now(timezone.utc).date(),
        employment_status="active",
    )
    db.add(employee)
    db.flush()

    # Unusable placeholder password — only the invite token can set the real one.
    placeholder_password_hash = hash_password(secrets.token_urlsafe(32))
    user = UserAccount(
        id=uuid.uuid4(),
        company_id=company_id,
        employee_id=employee.id,
        role_id=admin_role.id,
        email=email,
        password_hash=placeholder_password_hash,
        mfa_enabled=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    invite_token = create_invite_token(user.id)
    email_sent = try_send_invite_email(user.email, full_name, invite_token)
    return user, invite_token, email_sent


def resend_company_admin_invite(db: Session, company_id: UUID, user_account_id: UUID) -> tuple[UserAccount, str, bool]:
    """Regenerate an invite token for a company admin whose account hasn't
    redeemed its original invite yet. Mirrors employee_service.resend_invite()
    at the platform level — lets you re-issue a link for the same account
    instead of hitting the "email already exists" wall on a fresh invite."""
    user = (
        db.query(UserAccount)
        .filter(UserAccount.id == user_account_id, UserAccount.company_id == company_id)
        .first()
    )
    if not user:
        raise ValueError("User not found for this company")
    if user.invite_accepted_at:
        raise ValueError("This account has already set its password — nothing to resend")

    invite_token = create_invite_token(user.id)
    full_name = user.employee.full_name if user.employee else user.email
    email_sent = try_send_invite_email(user.email, full_name, invite_token)
    return user, invite_token, email_sent
