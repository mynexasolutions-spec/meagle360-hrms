"""
Models package — re-exports all ORM models for convenient imports.

Usage:
    from app.models import Company, Employee, UserAccount, ...
"""

from app.models.base import Base
from app.models.company import Company
from app.models.department import Department
from app.models.employee import Employee
from app.models.role import Role
from app.models.user_account import UserAccount
from app.models.platform_admin import PlatformAdmin
from app.models.shift import Shift
from app.models.employee_shift import EmployeeShift
from app.models.employee_document import EmployeeDocument
from app.models.attendance_record import AttendanceRecord
from app.models.holiday_calendar import HolidayCalendar
from app.models.leave_type import LeaveType
from app.models.leave_balance import LeaveBalance
from app.models.leave_request import LeaveRequest
from app.models.announcement import Announcement
from app.models.attendance_regularization import AttendanceRegularization
from app.models.overtime_request import OvertimeRequest
from app.models.audit_log import AuditLog
from app.models.user_account_role import UserAccountRole
from app.models.expense_category import ExpenseCategory
from app.models.expense_claim import ExpenseClaim
from app.models.site import Site
from app.models.salary_component import SalaryComponent
from app.models.salary_structure import SalaryStructure
from app.models.salary_structure_component import SalaryStructureComponent
from app.models.employee_salary_assignment import EmployeeSalaryAssignment
from app.models.payroll_run import PayrollRun
from app.models.payslip import Payslip
from app.models.payslip_line import PayslipLine

__all__ = [
    "Base",
    "Company",
    "Department",
    "Employee",
    "Role",
    "UserAccount",
    "PlatformAdmin",
    "Shift",
    "EmployeeShift",
    "EmployeeDocument",
    "AttendanceRecord",
    "HolidayCalendar",
    "LeaveType",
    "LeaveBalance",
    "LeaveRequest",
    "Announcement",
    "AttendanceRegularization",
    "OvertimeRequest",
    "AuditLog",
    "UserAccountRole",
    "ExpenseCategory",
    "ExpenseClaim",
    "Site",
    "SalaryComponent",
    "SalaryStructure",
    "SalaryStructureComponent",
    "EmployeeSalaryAssignment",
    "PayrollRun",
    "Payslip",
    "PayslipLine",
]
