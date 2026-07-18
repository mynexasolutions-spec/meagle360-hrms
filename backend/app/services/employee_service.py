"""Employee service — business logic for employee operations."""

import secrets
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_document import EmployeeDocument
from app.models.role import Role
from app.models.user_account import UserAccount
from app.repositories.employee_repo import EmployeeRepository
from app.services.audit_service import log_action
from app.services.auth_service import hash_password, create_invite_token


def _account_status(user_account: UserAccount | None) -> str:
    if not user_account:
        return "no_login"
    return "active" if user_account.invite_accepted_at else "invited"


class EmployeeService:
    def __init__(self, db: Session, company_id: UUID):
        self.repo = EmployeeRepository(db, company_id)
        self.db = db
        self.company_id = company_id

    def list_employees(self, skip: int = 0, limit: int = 100):
        return self.repo.get_all(skip, limit)

    def get_directory(self, skip: int = 0, limit: int = 100):
        return self.repo.get_directory(skip, limit)

    def to_directory_dict(self, e: Employee) -> dict:
        account = e.user_account
        return {
            "id": e.id,
            "full_name": e.full_name,
            "employee_code": e.employee_code,
            "department_name": e.department.name if e.department else None,
            "site_name": e.site.name if e.site else None,
            "photo_url": e.photo_url,
            "employment_status": e.employment_status,
            "date_of_hire": e.date_of_hire,
            "account_status": _account_status(account),
            "role_names": [r.name for r in account.all_roles] if account else [],
            "email": account.email if account else None,
        }

    def get_employee(self, employee_id: UUID):
        return self.repo.get_with_relations(employee_id)

    def to_profile_dict(self, e: Employee) -> dict:
        account = e.user_account
        return {
            "id": e.id,
            "company_id": e.company_id,
            "department_id": e.department_id,
            "department_name": e.department.name if e.department else None,
            "manager_id": e.manager_id,
            "manager_name": e.manager.full_name if e.manager else None,
            "site_id": e.site_id,
            "site_name": e.site.name if e.site else None,
            "full_name": e.full_name,
            "employee_code": e.employee_code,
            "date_of_hire": e.date_of_hire,
            "employment_status": e.employment_status,
            "photo_url": e.photo_url,
            "personal_email": e.personal_email,
            "phone": e.phone,
            "date_of_birth": e.date_of_birth,
            "gender": e.gender,
            "address": e.address,
            "emergency_contact_name": e.emergency_contact_name,
            "emergency_contact_phone": e.emergency_contact_phone,
            "created_at": e.created_at,
            "updated_at": e.updated_at,
            "account_status": _account_status(account),
            "role_names": [r.name for r in account.all_roles] if account else [],
            "email": account.email if account else None,
            "primary_role_id": account.role_id if account else None,
            "additional_role_ids": [link.role_id for link in account.role_links] if account else [],
        }

    def set_additional_roles(self, employee_id: UUID, additional_role_ids: list, actor_employee_id: UUID | None = None):
        """Replace an account's additional (non-primary) roles — how an
        Admin grants extra access (e.g. Payroll Manager) without changing
        someone's primary role."""
        from app.models.user_account_role import UserAccountRole

        employee = self.repo.get_with_relations(employee_id)
        if not employee or not employee.user_account:
            raise ValueError("Employee has no user account")

        account = employee.user_account
        self.db.query(UserAccountRole).filter(UserAccountRole.user_account_id == account.id).delete()
        for role_id in additional_role_ids:
            if role_id == account.role_id:
                continue  # already the primary role, no need for a duplicate link
            self.db.add(UserAccountRole(user_account_id=account.id, role_id=role_id))

        log_action(self.db, self.company_id, actor_employee_id, "employee.roles_updated", "employee", employee_id)
        self.db.commit()
        self.db.refresh(account)
        return account

    def create_employee(self, data: dict, actor_employee_id: UUID | None = None) -> Employee:
        employee = self.repo.create(data)
        log_action(self.db, self.company_id, actor_employee_id, "employee.created", "employee", employee.id)
        self.db.commit()
        return employee

    def update_employee(self, employee_id: UUID, data: dict, actor_employee_id: UUID | None = None):
        employee = self.repo.update(employee_id, data)
        if employee:
            safe_details = {k: str(v) for k, v in data.items()}
            log_action(self.db, self.company_id, actor_employee_id, "employee.updated", "employee", employee.id, safe_details)
            self.db.commit()
        return employee

    def delete_employee(self, employee_id: UUID, actor_employee_id: UUID | None = None) -> bool:
        deleted = self.repo.delete(employee_id)
        if deleted:
            log_action(self.db, self.company_id, actor_employee_id, "employee.deleted", "employee", employee_id)
            self.db.commit()
        return deleted

    def get_org_chart(self) -> list[dict]:
        """Build org chart tree from top-level employees."""
        top = self.repo.get_top_level_employees()
        return [self._build_tree(emp) for emp in top]

    def _build_tree(self, employee: Employee) -> dict:
        reports = self.repo.get_direct_reports(employee.id)
        return {
            "id": str(employee.id),
            "full_name": employee.full_name,
            "employee_code": employee.employee_code,
            "department_name": employee.department.name if employee.department else None,
            "direct_reports": [self._build_tree(r) for r in reports],
        }

    def add_document(self, employee_id: UUID, data: dict) -> EmployeeDocument:
        doc = EmployeeDocument(
            company_id=self.company_id,
            employee_id=employee_id,
            **data,
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def count(self) -> int:
        return self.repo.count()

    def invite_employee(self, data: dict, actor_employee_id: UUID | None = None) -> tuple[Employee, UserAccount, str]:
        """Create an employee + user account with an assigned role and return
        an invite token for them to set their own password. Mirrors
        platform_service.invite_company_admin()'s pattern at the tenant level."""
        role = (
            self.db.query(Role)
            .filter(Role.id == data["role_id"], Role.company_id == self.company_id)
            .first()
        )
        if not role:
            raise ValueError("Role not found for this company")

        existing_email = (
            self.db.query(UserAccount)
            .filter(UserAccount.company_id == self.company_id, UserAccount.email == data["email"])
            .first()
        )
        if existing_email:
            raise ValueError("A user with this email already exists in your organization")

        employee = self.repo.create({
            "full_name": data["full_name"],
            "employee_code": data["employee_code"],
            "department_id": data.get("department_id"),
            "manager_id": data.get("manager_id"),
            "site_id": data.get("site_id"),
            "date_of_hire": data["date_of_hire"],
            "employment_status": "active",
        })

        # Unusable placeholder password — only the invite token can set the real one.
        placeholder_password_hash = hash_password(secrets.token_urlsafe(32))
        user = UserAccount(
            company_id=self.company_id,
            employee_id=employee.id,
            role_id=role.id,
            email=data["email"],
            password_hash=placeholder_password_hash,
            mfa_enabled=False,
        )
        self.db.add(user)
        log_action(self.db, self.company_id, actor_employee_id, "employee.invited", "employee", employee.id)
        self.db.commit()
        self.db.refresh(user)

        invite_token = create_invite_token(user.id)
        return employee, user, invite_token

    def resend_invite(self, employee_id: UUID, actor_employee_id: UUID | None = None) -> str:
        """Regenerate an invite token for an employee whose account hasn't
        redeemed its original invite yet."""
        employee = self.repo.get_with_relations(employee_id)
        if not employee or not employee.user_account:
            raise ValueError("Employee has no user account to invite")
        if employee.user_account.invite_accepted_at:
            raise ValueError("This employee's account is already active")

        log_action(self.db, self.company_id, actor_employee_id, "employee.invite_resent", "employee", employee_id)
        self.db.commit()
        return create_invite_token(employee.user_account.id)
