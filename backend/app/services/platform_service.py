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

DEFAULT_EXPENSE_CATEGORIES = ["Travel", "Meals & Entertainment", "Office Supplies", "Transportation", "Other"]

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
) -> Company:
    """Create a new tenant, pending setup, with its default role set seeded."""
    company = Company(
        id=uuid.uuid4(),
        name=name,
        country=country,
        multi_entity=multi_entity,
        status="pending_setup",
        plan_tier=plan_tier,
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
) -> tuple[UserAccount, str]:
    """Create the first Admin employee + user account for a company and
    return an invite token for them to set their own password."""
    admin_role = (
        db.query(Role)
        .filter(Role.company_id == company_id, Role.name == "Admin")
        .first()
    )
    if not admin_role:
        raise ValueError("Company has no Admin role — was it created via create_company()?")

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
    return user, invite_token
