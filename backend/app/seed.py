"""
Seed script — creates demo company, departments, roles, employees, and leave types.

Usage:
    cd backend
    python -m app.seed
"""

import uuid
from datetime import date, timezone, datetime

from app.database import SessionLocal
from app.models import (
    Company, Department, Employee, Role, UserAccount,
    Shift, LeaveType, LeaveBalance, HolidayCalendar,
)
from app.services.auth_service import hash_password


def seed():
    db = SessionLocal()
    try:
        # Check if already seeded
        if db.query(Company).first():
            print("Database already seeded. Skipping.")
            return

        print("Seeding database...")

        # ── Company ──────────────────────────────────────
        company = Company(
            id=uuid.uuid4(),
            name="Meagle360 Corp",
            country="United States",
            multi_entity=False,
        )
        db.add(company)
        db.flush()

        # ── Departments ──────────────────────────────────
        engineering = Department(id=uuid.uuid4(), company_id=company.id, name="Engineering")
        hr = Department(id=uuid.uuid4(), company_id=company.id, name="Human Resources")
        finance = Department(id=uuid.uuid4(), company_id=company.id, name="Finance")
        marketing = Department(id=uuid.uuid4(), company_id=company.id, name="Marketing")
        frontend_team = Department(id=uuid.uuid4(), company_id=company.id, name="Frontend", parent_department_id=engineering.id)
        backend_team = Department(id=uuid.uuid4(), company_id=company.id, name="Backend", parent_department_id=engineering.id)
        db.add_all([engineering, hr, finance, marketing, frontend_team, backend_team])
        db.flush()

        # ── Roles ────────────────────────────────────────
        admin_role = Role(
            id=uuid.uuid4(),
            company_id=company.id,
            name="Admin",
            permissions={
                "employees:read": True, "employees:write": True,
                "attendance:read": True, "attendance:write": True, "attendance:approve": True,
                "leave:read": True, "leave:write": True, "leave:approve": True,
                "shifts:read": True, "shifts:write": True,
                "settings:read": True, "settings:write": True,
            },
        )
        manager_role = Role(
            id=uuid.uuid4(),
            company_id=company.id,
            name="Manager",
            permissions={
                "employees:read": True,
                "attendance:read": True, "attendance:write": True, "attendance:approve": True,
                "leave:read": True, "leave:approve": True,
                "shifts:read": True,
            },
        )
        employee_role = Role(
            id=uuid.uuid4(),
            company_id=company.id,
            name="Employee",
            permissions={
                "employees:read": True,
                "attendance:read": True, "attendance:write": True,
                "leave:read": True, "leave:write": True,
            },
        )
        hr_manager_role = Role(
            id=uuid.uuid4(),
            company_id=company.id,
            name="HR Manager",
            permissions={
                "employees:read": True, "employees:write": True,
                "attendance:read": True, "attendance:write": True, "attendance:approve": True,
                "leave:read": True, "leave:write": True, "leave:approve": True,
            },
        )
        expense_manager_role = Role(
            id=uuid.uuid4(),
            company_id=company.id,
            name="Expense Manager",
            permissions={
                "employees:read": True,
                "attendance:read": True, "attendance:write": True,
                "leave:read": True, "leave:write": True,
                "expenses:read": True, "expenses:write": True, "expenses:approve": True,
            },
        )
        helpdesk_manager_role = Role(
            id=uuid.uuid4(),
            company_id=company.id,
            name="Helpdesk Manager",
            permissions={
                "employees:read": True,
                "attendance:read": True, "attendance:write": True,
                "leave:read": True, "leave:write": True,
                "helpdesk:read": True, "helpdesk:write": True, "helpdesk:manage": True,
            },
        )
        project_admin_role = Role(
            id=uuid.uuid4(),
            company_id=company.id,
            name="Project Admin",
            permissions={
                "employees:read": True,
                "attendance:read": True, "attendance:write": True,
                "leave:read": True, "leave:write": True,
                "projects:read": True, "projects:write": True, "projects:manage": True,
            },
        )
        db.add_all([
            admin_role, manager_role, employee_role,
            hr_manager_role, expense_manager_role, helpdesk_manager_role, project_admin_role,
        ])
        db.flush()

        # ── Employees ────────────────────────────────────
        ceo = Employee(
            id=uuid.uuid4(), company_id=company.id,
            full_name="Sarah Johnson", employee_code="EMP001",
            date_of_hire=date(2020, 1, 15), department_id=engineering.id,
            employment_status="active",
        )
        hr_manager = Employee(
            id=uuid.uuid4(), company_id=company.id,
            full_name="Michael Chen", employee_code="EMP002",
            date_of_hire=date(2020, 3, 1), department_id=hr.id,
            manager_id=ceo.id, employment_status="active",
        )
        dev1 = Employee(
            id=uuid.uuid4(), company_id=company.id,
            full_name="Emily Davis", employee_code="EMP003",
            date_of_hire=date(2021, 6, 10), department_id=frontend_team.id,
            manager_id=ceo.id, employment_status="active",
        )
        dev2 = Employee(
            id=uuid.uuid4(), company_id=company.id,
            full_name="James Wilson", employee_code="EMP004",
            date_of_hire=date(2022, 2, 20), department_id=backend_team.id,
            manager_id=ceo.id, employment_status="active",
        )
        fin_analyst = Employee(
            id=uuid.uuid4(), company_id=company.id,
            full_name="Lisa Park", employee_code="EMP005",
            date_of_hire=date(2023, 1, 5), department_id=finance.id,
            manager_id=ceo.id, employment_status="active",
        )
        db.add_all([ceo, hr_manager, dev1, dev2, fin_analyst])
        db.flush()

        # ── User Accounts ────────────────────────────────
        users = [
            UserAccount(
                company_id=company.id, employee_id=ceo.id, role_id=admin_role.id,
                email="sarah@meagle360.com", password_hash=hash_password("admin123"),
            ),
            UserAccount(
                company_id=company.id, employee_id=hr_manager.id, role_id=manager_role.id,
                email="michael@meagle360.com", password_hash=hash_password("manager123"),
            ),
            UserAccount(
                company_id=company.id, employee_id=dev1.id, role_id=employee_role.id,
                email="emily@meagle360.com", password_hash=hash_password("employee123"),
            ),
            UserAccount(
                company_id=company.id, employee_id=dev2.id, role_id=employee_role.id,
                email="james@meagle360.com", password_hash=hash_password("employee123"),
            ),
            UserAccount(
                company_id=company.id, employee_id=fin_analyst.id, role_id=employee_role.id,
                email="lisa@meagle360.com", password_hash=hash_password("employee123"),
            ),
        ]
        db.add_all(users)

        # ── Shifts ───────────────────────────────────────
        from datetime import time
        shifts = [
            Shift(company_id=company.id, shift_type="Morning", start_time=time(9, 0), end_time=time(17, 0)),
            Shift(company_id=company.id, shift_type="Evening", start_time=time(14, 0), end_time=time(22, 0)),
            Shift(company_id=company.id, shift_type="Night", start_time=time(22, 0), end_time=time(6, 0)),
            Shift(company_id=company.id, shift_type="Flexible", start_time=time(7, 0), end_time=time(19, 0)),
        ]
        db.add_all(shifts)

        # ── Leave Types ──────────────────────────────────
        from decimal import Decimal
        leave_types = [
            LeaveType(id=uuid.uuid4(), company_id=company.id, name="Annual Leave", accrual_rate=Decimal("1.50")),
            LeaveType(id=uuid.uuid4(), company_id=company.id, name="Sick Leave", accrual_rate=Decimal("1.00")),
            LeaveType(id=uuid.uuid4(), company_id=company.id, name="Personal Leave", accrual_rate=Decimal("0.50")),
            LeaveType(id=uuid.uuid4(), company_id=company.id, name="Maternity/Paternity", accrual_rate=Decimal("0.00")),
        ]
        db.add_all(leave_types)
        db.flush()

        # ── Leave Balances (2026) ────────────────────────
        # Starting balance mirrors each type's own accrual rate * 12 months,
        # so a 0-accrual type (e.g. Maternity/Paternity before a company
        # sets a real rate) doesn't start with days nobody actually earned.
        year = 2026
        for emp in [ceo, hr_manager, dev1, dev2, fin_analyst]:
            for lt in leave_types:
                db.add(LeaveBalance(
                    company_id=company.id, employee_id=emp.id,
                    leave_type_id=lt.id, balance=lt.accrual_rate * 12, year=year,
                ))

        # ── Holidays ─────────────────────────────────────
        holidays = [
            HolidayCalendar(company_id=company.id, holiday_date=date(2026, 1, 1), name="New Year's Day"),
            HolidayCalendar(company_id=company.id, holiday_date=date(2026, 7, 4), name="Independence Day"),
            HolidayCalendar(company_id=company.id, holiday_date=date(2026, 12, 25), name="Christmas Day"),
            HolidayCalendar(company_id=company.id, holiday_date=date(2026, 11, 26), name="Thanksgiving"),
        ]
        db.add_all(holidays)

        db.commit()
        print("Seed complete!")
        print(f"   Company: {company.name} (ID: {company.id})")
        print(f"   Admin login: sarah@meagle360.com / admin123")
        print(f"   Manager login: michael@meagle360.com / manager123")
        print(f"   Employee login: emily@meagle360.com / employee123")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
