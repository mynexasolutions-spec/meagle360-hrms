"""
Seed script — creates a second, independent dummy company ("Dummy Test Org")
with one employee per tenant role, for exercising the full RBAC flow.

Safe to run alongside the existing Meagle360 Corp demo data — this creates
a brand-new company, so it never touches or duplicates existing records.
Re-running it is a no-op if "Dummy Test Org" already exists.

Usage:
    cd backend
    python -m app.seed_dummy_org
"""

import uuid
from datetime import date, timezone, datetime

from app.database import SessionLocal
from app.models import Company, Department, Employee, Role, UserAccount
from app.services.auth_service import hash_password

COMPANY_NAME = "Dummy Test Org"

ROLE_PERMISSIONS = {
    "Admin": {
        "employees:read": True, "employees:write": True,
        "attendance:read": True, "attendance:write": True, "attendance:approve": True,
        "leave:read": True, "leave:write": True, "leave:approve": True,
        "shifts:read": True, "shifts:write": True,
        "settings:read": True, "settings:write": True,
    },
    "Manager": {
        "employees:read": True,
        "attendance:read": True, "attendance:write": True, "attendance:approve": True,
        "leave:read": True, "leave:approve": True,
        "shifts:read": True,
    },
    "Employee": {
        "employees:read": True,
        "attendance:read": True, "attendance:write": True,
        "leave:read": True, "leave:write": True,
    },
    "HR Manager": {
        "employees:read": True, "employees:write": True,
        "attendance:read": True, "attendance:write": True, "attendance:approve": True,
        "leave:read": True, "leave:write": True, "leave:approve": True,
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
}

# (full_name, email local-part, employee_code, role name, password)
PEOPLE = [
    ("Priya Admin", "priya.admin", "DUMMY001", "Admin", "Admin@123"),
    ("Manav Manager", "manav.manager", "DUMMY002", "Manager", "Manager@123"),
    ("Esha Employee", "esha.employee", "DUMMY003", "Employee", "Employee@123"),
    ("Harish HR", "harish.hr", "DUMMY004", "HR Manager", "HrManager@123"),
    ("Ekta Expense", "ekta.expense", "DUMMY005", "Expense Manager", "ExpenseMgr@123"),
    ("Deepak Helpdesk", "deepak.helpdesk", "DUMMY006", "Helpdesk Manager", "HelpdeskMgr@123"),
    ("Priyanka Projects", "priyanka.projects", "DUMMY007", "Project Admin", "ProjectAdmin@123"),
]

EMAIL_DOMAIN = "dummytestorg.example.com"


def seed():
    db = SessionLocal()
    try:
        if db.query(Company).filter(Company.name == COMPANY_NAME).first():
            print(f'"{COMPANY_NAME}" already exists. Skipping.')
            return

        print(f"Seeding {COMPANY_NAME}...")

        company = Company(
            id=uuid.uuid4(),
            name=COMPANY_NAME,
            country="India",
            multi_entity=False,
            status="active",
            plan_tier="standard",
        )
        db.add(company)
        db.flush()

        department = Department(id=uuid.uuid4(), company_id=company.id, name="General")
        db.add(department)
        db.flush()

        roles_by_name = {}
        for role_name, permissions in ROLE_PERMISSIONS.items():
            role = Role(id=uuid.uuid4(), company_id=company.id, name=role_name, permissions=permissions)
            db.add(role)
            roles_by_name[role_name] = role
        db.flush()

        credentials = []
        for full_name, local_part, employee_code, role_name, password in PEOPLE:
            employee = Employee(
                id=uuid.uuid4(),
                company_id=company.id,
                full_name=full_name,
                employee_code=employee_code,
                department_id=department.id,
                date_of_hire=datetime.now(timezone.utc).date(),
                employment_status="active",
            )
            db.add(employee)
            db.flush()

            email = f"{local_part}@{EMAIL_DOMAIN}"
            user = UserAccount(
                id=uuid.uuid4(),
                company_id=company.id,
                employee_id=employee.id,
                role_id=roles_by_name[role_name].id,
                email=email,
                password_hash=hash_password(password),
            )
            db.add(user)
            credentials.append((role_name, email, password))

        db.commit()

        print(f"Seed complete! Company: {company.name} (ID: {company.id})")
        print()
        for role_name, email, password in credentials:
            print(f"   {role_name:<18} {email:<40} {password}")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
