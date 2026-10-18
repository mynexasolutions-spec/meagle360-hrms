"""Role-aware HRMS tools for the Meagle 360 AI Assistant.

Security invariants:
- `company_id` and `employee_id` are bound in `AIToolbox.__init__` from the verified JWT token.
  They are NEVER accepted from LLM tool arguments.
- In Employee mode (`is_admin_or_manager=False`), only personal self-service tools
  (`get_my_leave_summary`, `get_my_attendance_summary`, `prepare_my_leave_application`)
  are exposed and executed, strictly scoped to `self.employee_id`.
- Write actions (applying leave or approving/rejecting leave) are NEVER executed silently
  by the LLM; instead, tools generate `pending_actions` confirmation cards so the user
  explicitly clicks Confirm / Approve / Reject in the UI.
"""

from __future__ import annotations

import calendar
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from difflib import SequenceMatcher
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.repositories.attendance_regularization_repo import AttendanceRegularizationRepository
from app.repositories.employee_repo import EmployeeRepository
from app.repositories.leave_repo import (
    LeaveBalanceRepository,
    LeaveRequestRepository,
    LeaveTypeRepository,
)
from app.repositories.shift_repo import EmployeeShiftRepository
from app.services.attendance_service import AttendanceService, IST_OFFSET, _local_date
from app.services.payroll_service import PayrollService

try:
    from rapidfuzz import fuzz  # type: ignore
    HAS_RAPIDFUZZ = True
except ImportError:
    HAS_RAPIDFUZZ = False


def get_ist_now() -> datetime:
    return datetime.now(timezone.utc) + IST_OFFSET


def get_ist_today() -> date:
    return get_ist_now().date()


def format_ist_time(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local_dt = dt + IST_OFFSET
    return local_dt.strftime("%I:%M %p IST")


MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def parse_month_year(
    month: int | str | None = None,
    year: int | None = None,
    query_text: str | None = None,
) -> tuple[int, int]:
    """Resolve (month, year) from explicit args or natural language English/Hinglish text."""
    today = get_ist_today()
    resolved_month: int | None = None
    resolved_year: int | None = None

    if year is not None:
        try:
            y_val = int(year)
            if 2000 <= y_val <= 2100:
                resolved_year = y_val
        except (ValueError, TypeError):
            pass

    if month is not None:
        if isinstance(month, int) and 1 <= month <= 12:
            resolved_month = month
        else:
            m_str = str(month).strip().lower()
            if m_str.isdigit() and 1 <= int(m_str) <= 12:
                resolved_month = int(m_str)
            elif m_str in MONTH_MAP:
                resolved_month = MONTH_MAP[m_str]

    q = f"{month or ''} {query_text or ''}".strip().lower()
    if resolved_year is None and q:
        yr_match = re.search(r"\b(20\d{2})\b", q)
        if yr_match:
            resolved_year = int(yr_match.group(1))

    if resolved_month is None and q:
        if any(
            p in q
            for p in (
                "last month",
                "previous month",
                "pichle mahine",
                "pichhle mahine",
                "pichla mahina",
                "pichhla mahina",
                "prev month",
            )
        ):
            if today.month == 1:
                resolved_month = 12
                resolved_year = resolved_year or (today.year - 1)
            else:
                resolved_month = today.month - 1
        else:
            for mon_key, mon_num in sorted(MONTH_MAP.items(), key=lambda x: -len(x[0])):
                if re.search(rf"\b{re.escape(mon_key)}\b", q):
                    resolved_month = mon_num
                    break

    return (resolved_month or today.month, resolved_year or today.year)


def parse_iso_date(val: str | None, default: date | None = None, prefer_future: bool = False) -> date:
    if not val:
        return default or get_ist_today()
    cleaned = val.strip().lower()
    today = get_ist_today()
    if cleaned in ("today", "aaj", "now"):
        return today
    if cleaned in ("tomorrow", "tmrw", "tommorow"):
        return today + timedelta(days=1)
    if cleaned in ("day after tomorrow", "parso", "parson", "parsoon"):
        return today + timedelta(days=2)
    if cleaned in ("yesterday",):
        return today - timedelta(days=1)
    if cleaned == "kal":
        return (today + timedelta(days=1)) if prefer_future else (today - timedelta(days=1))

    # Standard ISO YYYY-MM-DD
    try:
        return date.fromisoformat(cleaned[:10])
    except ValueError:
        pass

    # DD-MM-YYYY or DD/MM/YYYY
    m_dmy = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", cleaned)
    if m_dmy:
        day_v = int(m_dmy.group(1))
        mon_v = int(m_dmy.group(2))
        yr_v = int(m_dmy.group(3)) if m_dmy.group(3) else today.year
        if yr_v < 100:
            yr_v += 2000
        try:
            return date(yr_v, mon_v, day_v)
        except ValueError:
            pass

    # "20 Oct", "20th October 2026", "Oct 20"
    m_text1 = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]{3,9})(?:\s+(\d{4}))?\b", cleaned)
    if m_text1:
        day_v = int(m_text1.group(1))
        mon_name = m_text1.group(2).lower()
        yr_v = int(m_text1.group(3)) if m_text1.group(3) else today.year
        if mon_name in MONTH_MAP:
            try:
                return date(yr_v, MONTH_MAP[mon_name], day_v)
            except ValueError:
                pass

    m_text2 = re.search(r"\b([a-zA-Z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b", cleaned)
    if m_text2:
        mon_name = m_text2.group(1).lower()
        day_v = int(m_text2.group(2))
        yr_v = int(m_text2.group(3)) if m_text2.group(3) else today.year
        if mon_name in MONTH_MAP:
            try:
                return date(yr_v, MONTH_MAP[mon_name], day_v)
            except ValueError:
                pass

    return default or today


WORD_NUM_MAP = {
    "ek": 1, "one": 1, "a": 1,
    "do": 2, "two": 2,
    "teen": 3, "three": 3,
    "char": 4, "chaar": 4, "four": 4,
    "paanch": 5, "panch": 5, "five": 5,
    "chhe": 6, "che": 6, "six": 6,
    "saat": 7, "sat": 7, "seven": 7,
    "aath": 8, "eight": 8,
    "nau": 9, "nine": 9,
    "das": 10, "ten": 10,
    "pandrah": 15, "fifteen": 15,
}


def extract_date_window_from_query(query_text: str | None) -> tuple[date, date] | None:
    """Extract an explicit single date or relative date range (e.g. 'pichle 2 din', 'last 2 days',
    'yesterday', 'today', '16 Oct') from a natural language query. Returns None if no date/window is mentioned."""
    if not query_text:
        return None
    q = query_text.strip().lower()
    today = get_ist_today()

    # 1. Relative past multi-day window: "pichle 2 din", "pichle 2 main", "last 2 days", "past 3 days"
    m_past = re.search(
        r"\b(?:pichle|pichhle|pichla|pichhla|last|past|previous|prev)\s+"
        r"(\d+|ek|do|teen|char|chaar|paanch|panch|chhe|che|saat|sat|aath|nau|das|pandrah|one|two|three|four|five|six|seven|eight|nine|ten|fifteen)"
        r"(?:\s*(?:din|dino|dinon|days|day|main|mein|me))?\b",
        q,
    )
    if m_past:
        tok = m_past.group(1)
        n_days = int(tok) if tok.isdigit() else WORD_NUM_MAP.get(tok, 2)
        n_days = max(1, min(n_days, 90))
        return (today - timedelta(days=n_days), today)

    if any(p in q for p in ("pichle hafte", "pichhle hafte", "last week", "past week")):
        return (today - timedelta(days=7), today)

    # 2. Relative future multi-day window: "agle 2 din", "next 3 days"
    m_future = re.search(
        r"\b(?:agle|next|upcoming|coming)\s+"
        r"(\d+|ek|do|teen|char|chaar|paanch|panch|saat|sat|one|two|three|four|five|seven)"
        r"(?:\s*(?:din|dino|dinon|days|day|main|mein|me))?\b",
        q,
    )
    if m_future:
        tok = m_future.group(1)
        n_days = int(tok) if tok.isdigit() else WORD_NUM_MAP.get(tok, 2)
        n_days = max(1, min(n_days, 90))
        return (today, today + timedelta(days=n_days))

    # 3. Explicit ISO dates YYYY-MM-DD
    iso_dates = re.findall(r"\b(\d{4}-\d{2}-\d{2})\b", q)
    if len(iso_dates) >= 2:
        d1 = parse_iso_date(iso_dates[0], default=today)
        d2 = parse_iso_date(iso_dates[1], default=d1)
        return (min(d1, d2), max(d1, d2))
    if len(iso_dates) == 1:
        d1 = parse_iso_date(iso_dates[0], default=today)
        return (d1, d1)

    # 4. Explicit text dates like "16 Oct", "16 Oct to 18 Oct"
    text_dates = re.findall(
        r"\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s+\d{4})?)\b",
        q,
    )
    if len(text_dates) >= 2:
        d1 = parse_iso_date(text_dates[0], default=today)
        d2 = parse_iso_date(text_dates[1], default=d1)
        return (min(d1, d2), max(d1, d2))
    if len(text_dates) == 1:
        d1 = parse_iso_date(text_dates[0], default=today)
        return (d1, d1)

    # 5. Single relative day keywords
    if any(w in q for w in ("day after tomorrow", "parso", "parson")):
        d = today + timedelta(days=2)
        return (d, d)
    if any(w in q for w in ("tomorrow", "tmrw", "tommorow")):
        d = today + timedelta(days=1)
        return (d, d)
    if re.search(r"\b(yesterday|kal)\b", q):
        d = today - timedelta(days=1)
        return (d, d)
    if re.search(r"\b(today|aaj)\b", q):
        return (today, today)

    return None


# ── OpenAI / Groq Function-Calling Tool Schemas ──────────────────────────

ADMIN_TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_daily_attendance",
            "description": (
                "Get company-wide daily attendance overview for a given date, including "
                "summary counts (present, absent, on leave, currently clocked in) and "
                "the list of employees with their IST check-in/check-out times and status."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "target_date": {
                        "type": "string",
                        "description": "Date in YYYY-MM-DD format (defaults to today in IST).",
                    },
                    "status_filter": {
                        "type": "string",
                        "enum": ["all", "present", "absent", "on_leave", "clocked_in_now"],
                        "description": "Optional filter to narrow employee list by attendance status.",
                    },
                    "department_filter": {
                        "type": "string",
                        "description": "Optional department name filter (e.g. 'Engineering', 'Sales', 'HR').",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_late_comers",
            "description": (
                "Get the list of employees who clocked in late on a given date compared "
                "to their assigned shift start time (or default 9:00 AM + 15 min grace = 9:15 AM IST)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "target_date": {
                        "type": "string",
                        "description": "Date in YYYY-MM-DD format (defaults to today in IST).",
                    },
                    "department_filter": {
                        "type": "string",
                        "description": "Optional department name filter (e.g. 'Engineering', 'Sales', 'HR').",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_employees_on_leave",
            "description": (
                "Get employees who have approved or pending leave requests for a single date or date range "
                "(e.g. today, yesterday, last 2 days / 'pichle 2 din', tomorrow, or next week)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {
                        "type": "string",
                        "description": "Start date in YYYY-MM-DD format (defaults to today in IST).",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "End date in YYYY-MM-DD format (defaults to start_date).",
                    },
                    "status_filter": {
                        "type": "string",
                        "enum": ["all", "approved", "pending"],
                        "description": "Filter by leave request status: 'approved', 'pending', or 'all'.",
                    },
                    "department_filter": {
                        "type": "string",
                        "description": "Optional department name filter (e.g. 'Engineering', 'Sales', 'HR').",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_employee",
            "description": (
                "Fuzzy-search for an employee by name or employee code (tolerates typos and voice "
                "transcription errors) and return their profile, department, designation, today's "
                "attendance status, recent/upcoming leaves, and remaining leave balance."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name_query": {
                        "type": "string",
                        "description": "Employee name, partial name, or employee code to search for.",
                    },
                },
                "required": ["name_query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_pending_approvals",
            "description": (
                "Get pending leave requests and pending attendance regularization requests "
                "waiting for Admin/Manager approval. Optionally filter by start_date and end_date "
                "if the Admin asked about a specific date or period (e.g. 'last 2 days', 'yesterday')."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {
                        "type": "string",
                        "description": "Optional start date filter in YYYY-MM-DD format.",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "Optional end date filter in YYYY-MM-DD format.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "prepare_leave_approval_action",
            "description": (
                "Use this when the Admin or Manager asks to approve or reject a specific employee's "
                "pending leave request (e.g. 'Approve Rahul's leave', 'Emily ki leave approve kar do', "
                "'Reject John's leave'). Finds matching pending leave request(s) and attaches an "
                "interactive Approve / Reject confirmation card below the message."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_name_query": {
                        "type": "string",
                        "description": "Optional employee name whose pending leave should be approved/rejected (leave empty to show all pending leaves).",
                    },
                    "intended_decision": {
                        "type": "string",
                        "enum": ["approved", "rejected"],
                        "description": "Whether the Admin/Manager wants to approve or reject the leave.",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Optional start date filter in YYYY-MM-DD format.",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "Optional end date filter in YYYY-MM-DD format.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_or_get_monthly_payroll",
            "description": (
                "Generate (create) a monthly Draft payroll run OR get the full payroll summary and "
                "employee-wise salary breakdown for a given month and year (e.g. 'Payroll bana do', "
                "'Generate payroll for October 2026', 'Kiske payroll mein kitni salary bani hai', "
                "'Rahul ki kitni salary bani hai', 'Show everyone's salary in payroll'). "
                "Automatically creates the Draft payroll run if it does not exist yet, returns every "
                "employee's Basic Pay, Gross Earnings, Total Deductions, LOP Days, LOP Amount, and "
                "Net Take-Home Salary, lists active employees missing a salary structure assignment, "
                "and attaches an interactive 'Finalize Payroll Run' button card if the run is in Draft status."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {
                        "type": "integer",
                        "description": "Month number 1-12 (defaults to current IST month).",
                    },
                    "year": {
                        "type": "integer",
                        "description": "4-digit year (defaults to current IST year).",
                    },
                    "employee_name_query": {
                        "type": "string",
                        "description": "Optional employee name or code if asking about a specific employee's salary/payslip.",
                    },
                    "department_filter": {
                        "type": "string",
                        "description": "Optional department name filter (e.g. 'Engineering', 'Sales', 'HR').",
                    },
                    "create_if_missing": {
                        "type": "boolean",
                        "description": "Whether to automatically create a Draft payroll run if none exists for that month (defaults to true).",
                    },
                },
                "required": [],
            },
        },
    },
]

EMPLOYEE_TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_my_leave_summary",
            "description": (
                "Get the logged-in employee's own leave balances (remaining days, used days, annual entitlement "
                "for Casual, Sick, Earned, or Unpaid leave) AND their recent/pending/approved leave requests."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {
                        "type": "integer",
                        "description": "Calendar year (defaults to current year).",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_attendance_summary",
            "description": (
                "Get the logged-in employee's own personal attendance summary, including today's check-in/out "
                "status, monthly present days count, total hours worked, late arrival count, and recent daily logs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {
                        "type": "integer",
                        "description": "Month number 1-12 (defaults to current month).",
                    },
                    "year": {
                        "type": "integer",
                        "description": "4-digit year (defaults to current year).",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "prepare_my_leave_application",
            "description": (
                "Use this when the logged-in employee asks to apply for or request a leave (e.g. "
                "'Apply sick leave for tomorrow', 'Mujhe kal aur parso ki casual leave chahiye', "
                "'Apply leave from 20 Oct to 22 Oct'). Validates leave balance and attaches an "
                "interactive Confirm & Apply Leave button card below the AI message."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "leave_type_query": {
                        "type": "string",
                        "description": "Leave type requested, e.g. 'Casual Leave', 'Sick Leave', 'Earned Leave', 'Unpaid'.",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Start date in YYYY-MM-DD format or natural word like 'tomorrow', 'today', '20 Oct'.",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "End date in YYYY-MM-DD format (defaults to start_date).",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Optional reason for the leave mentioned by the employee.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_payslip_summary",
            "description": (
                "Get the logged-in employee's own salary / payslip breakdown for a given month and year "
                "(e.g. 'Meri is mahine ki salary kitni bani hai?', 'What is my salary/payslip this month?'), "
                "including Basic Pay, Gross Earnings, Total Deductions, Working Days, LOP Days, Net Pay, "
                "and itemized earning/deduction components."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {
                        "type": "integer",
                        "description": "Month number 1-12 (defaults to current IST month).",
                    },
                    "year": {
                        "type": "integer",
                        "description": "4-digit year (defaults to current IST year).",
                    },
                },
                "required": [],
            },
        },
    },
]

# Keep backward-compatible alias
TOOL_SCHEMAS = ADMIN_TOOL_SCHEMAS


class AIToolbox:
    """Executes HRMS tools strictly scoped to `company_id` and role permissions."""

    def __init__(
        self,
        db: Session,
        company_id: UUID,
        employee_id: UUID | None = None,
        is_admin_or_manager: bool = True,
    ):
        self.db = db
        self.company_id = company_id
        self.employee_id = employee_id
        self.is_admin_or_manager = is_admin_or_manager
        self.attendance_svc = AttendanceService(db, company_id)
        self.payroll_svc = PayrollService(db, company_id)
        self.emp_repo = EmployeeRepository(db, company_id)
        self.leave_type_repo = LeaveTypeRepository(db, company_id)
        self.leave_repo = LeaveRequestRepository(db, company_id)
        self.leave_bal_repo = LeaveBalanceRepository(db, company_id)
        self.shift_repo = EmployeeShiftRepository(db, company_id)
        self.reg_repo = AttendanceRegularizationRepository(db, company_id)
        self.pending_actions: list[dict[str, Any]] = []
        self.current_user_query: str = ""

    def _resolve_query_date_window(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> tuple[date, date] | None:
        """Resolve an explicit or natural-language date window from tool args + current_user_query."""
        query_window = extract_date_window_from_query(self.current_user_query)

        # If the user's natural query asked for a multi-day window (e.g. 'pichle 2 din' / 'last 2 days'),
        # prioritize that exact window even if the LLM passed a single date or omitted dates.
        if query_window and query_window[0] != query_window[1]:
            return query_window

        if start_date:
            s_d = parse_iso_date(start_date)
            e_d = parse_iso_date(end_date, default=s_d)
            if e_d < s_d:
                e_d = s_d
            return (s_d, e_d)

        return query_window

    def _add_pending_action(self, card: dict[str, Any]) -> None:
        if not any(existing.get("action_id") == card.get("action_id") for existing in self.pending_actions):
            self.pending_actions.append(card)

    def list_departments(self) -> list[str]:
        from app.models.department import Department
        rows = (
            self.db.query(Department.name)
            .filter(Department.company_id == self.company_id)
            .order_by(Department.name.asc())
            .all()
        )
        return [r[0] for r in rows if r[0]]

    def detect_department(self, query_text: str) -> str | None:
        """Detect a department name mentioned in the user's natural language query."""
        q = (query_text or "").lower()
        for dept_name in self.list_departments():
            dn_low = dept_name.strip().lower()
            if dn_low and dn_low in q:
                return dept_name
        alias_map = {
            "engineering": "Engineering",
            "engine ring": "Engineering",
            "engine ": "Engineering",
            "injini": "Engineering",
            "tech": "Engineering",
            "developer": "Engineering",
            "product": "Product",
            "prodakt": "Product",
            "design": "Product",
            "sales": "Sales",
            "sels": "Sales",
            "cell department": "Sales",
            "marketing": "Marketing",
            "human resource": "HR",
            "hr ": "HR",
            " hr": "HR",
            "finance": "Finance",
            "fainans": "Finance",
            "accounts": "Finance",
            "operations": "Operations",
        }
        for key, canonical in alias_map.items():
            if key in q:
                return canonical
        return None

    def execute(self, tool_name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        args = arguments or {}

        # Strict guard: Employees can NEVER execute company-wide Admin/Manager tools
        if not self.is_admin_or_manager:
            if tool_name == "get_my_leave_summary":
                return self.get_my_leave_summary(year=args.get("year"))
            if tool_name == "get_my_attendance_summary":
                return self.get_my_attendance_summary(
                    month=args.get("month"),
                    year=args.get("year"),
                )
            if tool_name == "prepare_my_leave_application":
                return self.prepare_my_leave_application(
                    leave_type_query=args.get("leave_type_query"),
                    start_date=args.get("start_date"),
                    end_date=args.get("end_date"),
                    reason=args.get("reason"),
                )
            if tool_name == "get_my_payslip_summary":
                return self.get_my_payslip_summary(
                    month=args.get("month"),
                    year=args.get("year"),
                )
            return {
                "error": (
                    "Access denied: Company-wide attendance, payroll runs, and other employees' salary records "
                    "are only accessible to Organization Admins and HR Managers. You can check your own "
                    "salary/payslip, leave balance, attendance, or apply for leave."
                )
            }

        # Admin / Manager tool execution
        if tool_name == "get_daily_attendance":
            return self.get_daily_attendance(
                target_date=args.get("target_date"),
                status_filter=args.get("status_filter"),
                department_filter=args.get("department_filter"),
            )
        if tool_name == "get_late_comers":
            return self.get_late_comers(
                target_date=args.get("target_date"),
                department_filter=args.get("department_filter"),
            )
        if tool_name == "get_employees_on_leave":
            return self.get_employees_on_leave(
                start_date=args.get("start_date"),
                end_date=args.get("end_date"),
                status_filter=args.get("status_filter", "all"),
                department_filter=args.get("department_filter"),
            )
        if tool_name == "find_employee":
            return self.find_employee(name_query=str(args.get("name_query", "")))
        if tool_name == "get_pending_approvals":
            return self.get_pending_approvals(
                attach_action_cards=True,
                start_date=args.get("start_date"),
                end_date=args.get("end_date"),
            )
        if tool_name == "prepare_leave_approval_action":
            return self.prepare_leave_approval_action(
                employee_name_query=args.get("employee_name_query"),
                intended_decision=args.get("intended_decision", "approved"),
                start_date=args.get("start_date"),
                end_date=args.get("end_date"),
            )
        if tool_name == "run_or_get_monthly_payroll":
            return self.run_or_get_monthly_payroll(
                month=args.get("month"),
                year=args.get("year"),
                employee_name_query=args.get("employee_name_query"),
                department_filter=args.get("department_filter"),
                create_if_missing=bool(args.get("create_if_missing", True)),
            )
        # Admins/Managers can also check their own leave/attendance/payslip if they ask
        if tool_name == "get_my_leave_summary":
            return self.get_my_leave_summary(year=args.get("year"))
        if tool_name == "get_my_attendance_summary":
            return self.get_my_attendance_summary(month=args.get("month"), year=args.get("year"))
        if tool_name == "prepare_my_leave_application":
            return self.prepare_my_leave_application(
                leave_type_query=args.get("leave_type_query"),
                start_date=args.get("start_date"),
                end_date=args.get("end_date"),
                reason=args.get("reason"),
            )
        if tool_name == "get_my_payslip_summary":
            return self.get_my_payslip_summary(
                month=args.get("month"),
                year=args.get("year"),
            )
        return {"error": f"Unknown tool: {tool_name}"}

    # ══════════════════════════════════════════════════════════════════════
    # ADMIN / MANAGER TOOLS
    # ══════════════════════════════════════════════════════════════════════

    # ── 1. Daily Attendance Overview ─────────────────────────────────────
    def get_daily_attendance(
        self,
        target_date: str | None = None,
        status_filter: str | None = None,
        department_filter: str | None = None,
    ) -> dict[str, Any]:
        d = parse_iso_date(target_date)
        raw = self.attendance_svc.get_daily_overview(d)
        all_rows = raw.get("employees", [])

        if department_filter and department_filter.strip():
            dept_q = department_filter.strip().lower()
            all_rows = [
                r for r in all_rows
                if r.get("department") and dept_q in r["department"].lower()
            ]

        present_rows = []
        absent_rows = []
        on_leave_rows = []
        clocked_in_now_rows = []

        formatted_rows = []
        for r in all_rows:
            status = r["status"]
            item = {
                "employee_name": r["employee_name"],
                "department": r["department"] or "Unassigned",
                "status": status,
                "check_in": format_ist_time(r["check_in"]),
                "check_out": format_ist_time(r["check_out"]),
                "leave_type": r["leave_type"],
            }
            formatted_rows.append(item)

            if status.startswith("Present"):
                present_rows.append(item)
                if status == "Present (Not Clocked Out)":
                    clocked_in_now_rows.append(item)
            elif status == "On Leave":
                on_leave_rows.append(item)
            elif status == "Absent":
                absent_rows.append(item)

        sf = (status_filter or "all").lower()
        if sf == "present":
            filtered_list = present_rows
        elif sf == "absent":
            filtered_list = absent_rows
        elif sf == "on_leave":
            filtered_list = on_leave_rows
        elif sf == "clocked_in_now":
            filtered_list = clocked_in_now_rows
        else:
            filtered_list = formatted_rows

        return {
            "date": d.isoformat(),
            "date_formatted": d.strftime("%d %b %Y (%A)"),
            "department_filter": department_filter,
            "summary": {
                "total_employees": len(formatted_rows),
                "present_count": len(present_rows),
                "present_today": len(present_rows),
                "currently_in_office_count": len(clocked_in_now_rows),
                "on_leave_count": len(on_leave_rows),
                "on_leave_today": len(on_leave_rows),
                "absent_count": len(absent_rows),
            },
            "status_filter_applied": sf,
            "employees": filtered_list[:60],
        }

    # ── 2. Late Comers ───────────────────────────────────────────────────
    def get_late_comers(
        self,
        target_date: str | None = None,
        department_filter: str | None = None,
    ) -> dict[str, Any]:
        d = parse_iso_date(target_date)
        employees = self.emp_repo.get_directory(limit=1000)
        if department_filter and department_filter.strip():
            dept_q = department_filter.strip().lower()
            employees = [
                e for e in employees
                if e.department and dept_q in e.department.name.lower()
            ]
        records = self.attendance_svc.repo.get_by_date_range(d, d, employee_id=None)

        records_by_emp: dict[UUID, list] = defaultdict(list)
        for rec in records:
            if _local_date(rec.clock_in) == d:
                records_by_emp[rec.employee_id].append(rec)

        roster = self.shift_repo.get_roster(skip=0, limit=1000)
        shift_by_emp: dict[UUID, Any] = {}
        for assignment in roster:
            if assignment.employee_id not in shift_by_emp and assignment.shift:
                shift_by_emp[assignment.employee_id] = assignment.shift

        late_employees = []
        on_time_count = 0

        for emp in employees:
            sessions = sorted(records_by_emp.get(emp.id, []), key=lambda r: r.clock_in)
            if not sessions:
                continue

            first_in = sessions[0].clock_in
            if first_in.tzinfo is None:
                first_in = first_in.replace(tzinfo=timezone.utc)
            local_in = first_in + IST_OFFSET
            in_mins = local_in.hour * 60 + local_in.minute

            shift = shift_by_emp.get(emp.id)
            if shift and shift.start_time:
                shift_start_mins = shift.start_time.hour * 60 + shift.start_time.minute
                shift_label = f"{shift.shift_type} ({shift.start_time.strftime('%I:%M %p')})"
            else:
                shift_start_mins = 9 * 60  # Default 9:00 AM
                shift_label = "General Shift (09:00 AM)"

            grace_threshold = shift_start_mins + 15  # 15-minute grace window
            if in_mins > grace_threshold:
                late_by_mins = in_mins - shift_start_mins
                late_employees.append({
                    "employee_name": emp.full_name,
                    "employee_code": emp.employee_code,
                    "department": emp.department.name if emp.department else "Unassigned",
                    "shift": shift_label,
                    "check_in": local_in.strftime("%I:%M %p IST"),
                    "late_by_minutes": late_by_mins,
                })
            else:
                on_time_count += 1

        late_employees.sort(key=lambda x: x["late_by_minutes"], reverse=True)

        return {
            "date": d.isoformat(),
            "date_formatted": d.strftime("%d %b %Y (%A)"),
            "department_filter": department_filter,
            "grace_rule": "15 minutes after shift start time (default threshold 09:15 AM IST)",
            "total_present": len(late_employees) + on_time_count,
            "late_count": len(late_employees),
            "on_time_count": on_time_count,
            "late_comers": late_employees,
        }

    # ── 3. Employees on Leave ────────────────────────────────────────────
    def get_employees_on_leave(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        status_filter: str = "all",
        department_filter: str | None = None,
    ) -> dict[str, Any]:
        window = self._resolve_query_date_window(start_date, end_date)
        if window:
            s_date, e_date = window
        else:
            s_date = parse_iso_date(start_date)
            e_date = parse_iso_date(end_date, default=s_date)
            if e_date < s_date:
                e_date = s_date

        leaves = self.leave_repo.get_overlapping_range(s_date, e_date)
        sf = (status_filter or "all").lower()
        dept_q = department_filter.strip().lower() if (department_filter and department_filter.strip()) else None

        items = []
        for lr in leaves:
            if sf in ("approved", "pending") and lr.status != sf:
                continue
            emp = lr.employee
            emp_dept = emp.department.name if (emp and emp.department) else "Unassigned"
            if dept_q and dept_q not in emp_dept.lower():
                continue
            days_count = (lr.end_date - lr.start_date).days + 1
            lt_name = lr.leave_type.name if lr.leave_type else "Leave"
            emp_name = emp.full_name if emp else "Unknown"
            emp_code = emp.employee_code if emp else None

            items.append({
                "leave_request_id": str(lr.id),
                "employee_name": emp_name,
                "employee_code": emp_code,
                "department": emp_dept,
                "leave_type": lt_name,
                "status": lr.status,
                "start_date": lr.start_date.isoformat(),
                "end_date": lr.end_date.isoformat(),
                "days": days_count,
                "reason": getattr(lr, "reason", None),
            })

            if lr.status == "pending" and len(self.pending_actions) < 6:
                bal_obj = self.leave_bal_repo.get_specific(
                    lr.employee_id, lr.leave_type_id, lr.start_date.year
                )
                avail_bal = float(bal_obj.balance) if bal_obj else None
                self._add_pending_action({
                    "action_id": f"approve-leave-{lr.id}",
                    "action_type": "approve_leave",
                    "title": f"Pending Leave Approval — {emp_name}",
                    "leave_request_id": str(lr.id),
                    "employee_name": emp_name,
                    "employee_code": emp_code,
                    "department": emp_dept,
                    "leave_type_id": str(lr.leave_type_id),
                    "leave_type_name": lt_name,
                    "start_date": lr.start_date.isoformat(),
                    "end_date": lr.end_date.isoformat(),
                    "days": days_count,
                    "available_balance": avail_bal,
                    "reason": getattr(lr, "reason", None),
                    "intended_decision": "approved",
                })

        approved_list = [i for i in items if i["status"] == "approved"]
        pending_list = [i for i in items if i["status"] == "pending"]

        date_range_label = (
            s_date.strftime("%d %b %Y")
            if s_date == e_date
            else f"{s_date.strftime('%d %b %Y')} to {e_date.strftime('%d %b %Y')}"
        )

        result: dict[str, Any] = {
            "start_date": s_date.isoformat(),
            "end_date": e_date.isoformat(),
            "date_range_label": date_range_label,
            "department_filter": department_filter,
            "total_matching_requests": len(items),
            "approved_count": len(approved_list),
            "pending_count": len(pending_list),
            "leaves": items,
        }
        if not items:
            result["strict_instruction"] = (
                f"There are 0 leave requests for {date_range_label}. "
                f"Directly tell the user that no leave requests came/exist for {date_range_label}, "
                "and DO NOT mention or show any leave requests from other dates."
            )
        return result

    # ── 4. Fuzzy Employee Lookup ─────────────────────────────────────────
    def find_employee(self, name_query: str) -> dict[str, Any]:
        query = (name_query or "").strip()
        if not query:
            return {"error": "Please provide an employee name or code to search."}

        employees = self.emp_repo.get_directory(limit=1000)
        if not employees:
            return {"query": query, "matches": [], "message": "No employees found in company directory."}

        scored: list[tuple[float, Any]] = []
        q_lower = query.lower()

        for emp in employees:
            full_name = emp.full_name or ""
            code = emp.employee_code or ""
            fn_lower = full_name.lower()
            code_lower = code.lower()

            if q_lower == code_lower or q_lower == fn_lower:
                score = 100.0
            elif q_lower in fn_lower or any(tok.startswith(q_lower) for tok in fn_lower.split()):
                score = 92.0
            elif HAS_RAPIDFUZZ:
                score = float(
                    max(
                        fuzz.WRatio(q_lower, fn_lower),
                        fuzz.partial_ratio(q_lower, fn_lower),
                        fuzz.ratio(q_lower, code_lower),
                    )
                )
            else:
                tokens = fn_lower.split()
                best_tok = max((SequenceMatcher(None, q_lower, t).ratio() for t in tokens), default=0.0)
                full_ratio = SequenceMatcher(None, q_lower, fn_lower).ratio()
                score = max(best_tok, full_ratio) * 100.0

            if score >= 58.0:
                scored.append((score, emp))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        top_matches = scored[:5]

        today = get_ist_today()
        daily_overview = self.attendance_svc.get_daily_overview(today)
        att_by_emp_id = {
            r["employee_id"]: r for r in daily_overview.get("employees", [])
        }

        results = []
        for score, emp in top_matches:
            att = att_by_emp_id.get(str(emp.id), {})
            balances = self.leave_bal_repo.get_by_employee(emp.id, today.year)
            bal_summary = [
                {
                    "leave_type": b.leave_type.name if b.leave_type else "Leave",
                    "remaining_days": float(b.balance),
                }
                for b in balances
            ]
            results.append({
                "match_score": round(score, 1),
                "employee_name": emp.full_name,
                "employee_code": emp.employee_code,
                "department": emp.department.name if emp.department else "Unassigned",
                "designation": emp.designation.title if emp.designation else "Unassigned",
                "employment_status": emp.employment_status,
                "today_status": att.get("status", "Absent"),
                "today_check_in": format_ist_time(att.get("check_in")),
                "today_check_out": format_ist_time(att.get("check_out")),
                "today_leave_type": att.get("leave_type"),
                "leave_balances": bal_summary,
            })

        return {
            "query": query,
            "date": today.isoformat(),
            "match_count": len(results),
            "matches": results,
        }

    # ── 5. Pending Approvals Queue ───────────────────────────────────────
    def get_pending_approvals(
        self,
        attach_action_cards: bool = False,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        pending_leaves = self.leave_repo.get_pending(skip=0, limit=50)
        pending_regs = self.reg_repo.get_pending(skip=0, limit=50)

        window = self._resolve_query_date_window(start_date, end_date)
        date_range_label = None
        if window:
            s_date, e_date = window
            date_range_label = (
                s_date.strftime("%d %b %Y")
                if s_date == e_date
                else f"{s_date.strftime('%d %b %Y')} to {e_date.strftime('%d %b %Y')}"
            )
            pending_leaves = [
                lr for lr in pending_leaves
                if lr.start_date <= e_date and lr.end_date >= s_date
            ]
            pending_regs = [
                r for r in pending_regs
                if r.record_date and s_date <= r.record_date <= e_date
            ]

        leave_items = []
        for lr in pending_leaves:
            emp = lr.employee
            emp_name = emp.full_name if emp else "Unknown"
            emp_code = emp.employee_code if emp else None
            emp_dept = emp.department.name if (emp and emp.department) else "Unassigned"
            lt_name = lr.leave_type.name if lr.leave_type else "Leave"
            days_cnt = (lr.end_date - lr.start_date).days + 1

            bal_obj = self.leave_bal_repo.get_specific(
                lr.employee_id, lr.leave_type_id, lr.start_date.year
            )
            avail_bal = float(bal_obj.balance) if bal_obj else None

            item = {
                "leave_request_id": str(lr.id),
                "employee_name": emp_name,
                "employee_code": emp_code,
                "department": emp_dept,
                "leave_type": lt_name,
                "start_date": lr.start_date.isoformat(),
                "end_date": lr.end_date.isoformat(),
                "days": days_cnt,
                "available_balance": avail_bal,
                "reason": getattr(lr, "reason", None),
            }
            leave_items.append(item)

            if attach_action_cards and len(self.pending_actions) < 6:
                self._add_pending_action({
                    "action_id": f"approve-leave-{lr.id}",
                    "action_type": "approve_leave",
                    "title": f"Pending Leave Approval — {emp_name}",
                    "leave_request_id": str(lr.id),
                    "employee_name": emp_name,
                    "employee_code": emp_code,
                    "department": emp_dept,
                    "leave_type_id": str(lr.leave_type_id),
                    "leave_type_name": lt_name,
                    "start_date": lr.start_date.isoformat(),
                    "end_date": lr.end_date.isoformat(),
                    "days": days_cnt,
                    "available_balance": avail_bal,
                    "reason": getattr(lr, "reason", None),
                    "intended_decision": "approved",
                })

        reg_items = [
            {
                "employee_name": r.employee.full_name if r.employee else "Unknown",
                "record_date": r.record_date.isoformat() if r.record_date else None,
                "reason": r.reason,
            }
            for r in pending_regs
        ]

        result: dict[str, Any] = {
            "date_window_filter": date_range_label,
            "pending_leave_requests_count": len(leave_items),
            "pending_regularizations_count": len(reg_items),
            "pending_leave_requests": leave_items,
            "pending_regularizations": reg_items,
        }
        if date_range_label and not leave_items:
            result["strict_instruction"] = (
                f"There are 0 leave requests for {date_range_label}. "
                f"Directly tell the user that no leave requests came/exist for {date_range_label}, "
                "and DO NOT mention or show any leave requests from other dates."
            )
        return result

    # ── 6. Prepare Leave Approval Card (Admin / Manager Action) ──────────
    def prepare_leave_approval_action(
        self,
        employee_name_query: str | None = None,
        intended_decision: str = "approved",
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        pending_leaves = self.leave_repo.get_pending(skip=0, limit=50)
        window = self._resolve_query_date_window(start_date, end_date)
        date_range_label = None
        if window:
            s_date, e_date = window
            date_range_label = (
                s_date.strftime("%d %b %Y")
                if s_date == e_date
                else f"{s_date.strftime('%d %b %Y')} to {e_date.strftime('%d %b %Y')}"
            )
            pending_leaves = [
                lr for lr in pending_leaves
                if lr.start_date <= e_date and lr.end_date >= s_date
            ]

        if not pending_leaves:
            msg = (
                f"No leave requests were found for {date_range_label}."
                if date_range_label
                else "There are currently 0 pending leave requests waiting for approval."
            )
            return {
                "found_count": 0,
                "date_window_filter": date_range_label,
                "message": msg,
                "strict_instruction": (
                    f"{msg} State this directly in one sentence and DO NOT mention or list any other dates."
                ),
                "pending_leave_requests": [],
            }

        query = (employee_name_query or "").strip().lower()
        matched_leaves = []

        if not query or query in ("all", "everyone", "sab", "sabhi", "pending"):
            matched_leaves = pending_leaves[:6]
        else:
            scored = []
            for lr in pending_leaves:
                emp_name = (lr.employee.full_name if lr.employee else "").lower()
                emp_code = (lr.employee.employee_code if lr.employee else "").lower()
                if query in emp_name or query == emp_code:
                    score = 95.0
                elif HAS_RAPIDFUZZ:
                    score = float(max(fuzz.WRatio(query, emp_name), fuzz.partial_ratio(query, emp_name)))
                else:
                    score = SequenceMatcher(None, query, emp_name).ratio() * 100.0
                if score >= 55.0:
                    scored.append((score, lr))
            scored.sort(key=lambda x: x[0], reverse=True)
            matched_leaves = [pair[1] for pair in scored[:5]]

        if not matched_leaves:
            return {
                "found_count": 0,
                "query": employee_name_query,
                "date_window_filter": date_range_label,
                "message": f"No pending leave request found matching '{employee_name_query}'.",
                "strict_instruction": (
                    f"Tell the user directly that no pending leave request was found matching '{employee_name_query}'. "
                    "Do not list unrelated leave requests from other dates."
                ),
            }

        cards_created = []
        for lr in matched_leaves:
            emp = lr.employee
            emp_name = emp.full_name if emp else "Unknown"
            emp_code = emp.employee_code if emp else None
            emp_dept = emp.department.name if (emp and emp.department) else "Unassigned"
            lt_name = lr.leave_type.name if lr.leave_type else "Leave"
            days_cnt = (lr.end_date - lr.start_date).days + 1
            bal_obj = self.leave_bal_repo.get_specific(
                lr.employee_id, lr.leave_type_id, lr.start_date.year
            )
            avail_bal = float(bal_obj.balance) if bal_obj else None

            card = {
                "action_id": f"approve-leave-{lr.id}",
                "action_type": "approve_leave",
                "title": f"Leave Approval — {emp_name}",
                "leave_request_id": str(lr.id),
                "employee_name": emp_name,
                "employee_code": emp_code,
                "department": emp_dept,
                "leave_type_id": str(lr.leave_type_id),
                "leave_type_name": lt_name,
                "start_date": lr.start_date.isoformat(),
                "end_date": lr.end_date.isoformat(),
                "days": days_cnt,
                "available_balance": avail_bal,
                "reason": getattr(lr, "reason", None),
                "intended_decision": intended_decision or "approved",
            }
            self._add_pending_action(card)
            cards_created.append(card)

        return {
            "found_count": len(cards_created),
            "date_window_filter": date_range_label,
            "instruction": (
                "Tell the Admin/Manager the details of the pending leave request(s) found and "
                "ask them to click the 'Approve Leave' or 'Reject' button on the card below to confirm."
            ),
            "matching_requests": cards_created,
        }

    # ── 7. Run or Get Monthly Payroll & Salary Breakdown (Admin / HR) ────
    def run_or_get_monthly_payroll(
        self,
        month: int | str | None = None,
        year: int | None = None,
        employee_name_query: str | None = None,
        department_filter: str | None = None,
        create_if_missing: bool = True,
    ) -> dict[str, Any]:
        resolved_month, resolved_year = parse_month_year(month=month, year=year)
        month_label = date(resolved_year, resolved_month, 1).strftime("%B %Y")
        _, last_day = calendar.monthrange(resolved_year, resolved_month)
        as_of = date(resolved_year, resolved_month, last_day)

        all_active_emps = [
            e
            for e in self.emp_repo.get_directory(limit=1000)
            if (e.employment_status or "active") == "active"
        ]
        current_assignments = self.payroll_svc.assignment_repo.get_all_current(as_of)
        assigned_emp_ids = {a.employee_id for a in current_assignments}

        unassigned_employees = [
            {
                "employee_name": e.full_name,
                "employee_code": e.employee_code,
                "department": e.department.name if e.department else "Unassigned",
                "designation": e.designation.title if e.designation else "Unassigned",
            }
            for e in all_active_emps
            if e.id not in assigned_emp_ids
        ]

        run = self.payroll_svc.run_repo.get_by_year_month(resolved_year, resolved_month)
        action_taken = "existing_run"

        if not run and create_if_missing:
            if not current_assignments:
                return {
                    "month": resolved_month,
                    "year": resolved_year,
                    "month_label": month_label,
                    "action_taken": "cannot_create_no_assignments",
                    "error": (
                        f"Cannot generate payroll for {month_label} because no employees have a "
                        "Salary Structure assigned as of this month. Please assign employees to a "
                        "Salary Structure in Payroll Studio first."
                    ),
                    "active_employees_count": len(all_active_emps),
                    "unassigned_employees_count": len(unassigned_employees),
                    "unassigned_employees": unassigned_employees[:25],
                }
            try:
                run = self.payroll_svc.run_payroll(
                    year=resolved_year,
                    month=resolved_month,
                    actor_employee_id=self.employee_id,
                )
                action_taken = "created_new_draft_run"
            except ValueError as exc:
                return {
                    "month": resolved_month,
                    "year": resolved_year,
                    "month_label": month_label,
                    "action_taken": "error",
                    "error": str(exc),
                    "unassigned_employees_count": len(unassigned_employees),
                    "unassigned_employees": unassigned_employees[:25],
                }

        if not run:
            return {
                "month": resolved_month,
                "year": resolved_year,
                "month_label": month_label,
                "action_taken": "not_found",
                "message": f"No payroll run exists yet for {month_label}.",
                "assigned_employees_count": len(current_assignments),
                "unassigned_employees_count": len(unassigned_employees),
                "unassigned_employees": unassigned_employees[:25],
            }

        payslips = self.payroll_svc.get_run_payslips(run.id)
        payslip_emp_ids = {p.employee_id for p in payslips}

        # Include any active employee not present in this run's payslips in the unassigned/skipped list
        skipped_employees = [
            {
                "employee_name": e.full_name,
                "employee_code": e.employee_code,
                "department": e.department.name if e.department else "Unassigned",
                "reason": (
                    "No Salary Structure assigned"
                    if e.id not in assigned_emp_ids
                    else "Assigned after payroll draft was created"
                ),
            }
            for e in all_active_emps
            if e.id not in payslip_emp_ids
        ]

        dept_q = (
            department_filter.strip().lower()
            if (department_filter and department_filter.strip())
            else None
        )

        employee_salaries: list[dict[str, Any]] = []
        total_gross = 0.0
        total_deductions = 0.0
        total_net = 0.0
        total_lop_employees = 0

        for p in payslips:
            emp = p.employee
            emp_name = emp.full_name if emp else "Unknown"
            emp_code = emp.employee_code if emp else None
            emp_dept = emp.department.name if (emp and emp.department) else "Unassigned"
            emp_desig = emp.designation.title if (emp and emp.designation) else "Unassigned"

            if dept_q and dept_q not in emp_dept.lower():
                continue

            gross_val = float(p.gross_earnings or 0)
            ded_val = float(p.gross_deductions or 0)
            net_val = float(p.net_pay or 0)
            lop_d = float(p.lop_days or 0)
            lop_amt = float(p.lop_amount or 0)

            total_gross += gross_val
            total_deductions += ded_val
            total_net += net_val
            if lop_d > 0:
                total_lop_employees += 1

            earnings_lines = [
                {"component": ln.component_name, "amount": round(float(ln.amount), 2)}
                for ln in (p.lines or [])
                if ln.component_type == "earning"
            ]
            deduction_lines = [
                {"component": ln.component_name, "amount": round(float(ln.amount), 2)}
                for ln in (p.lines or [])
                if ln.component_type == "deduction"
            ]

            employee_salaries.append({
                "payslip_id": str(p.id),
                "payslip_number": p.payslip_number,
                "employee_name": emp_name,
                "employee_code": emp_code,
                "department": emp_dept,
                "designation": emp_desig,
                "working_days": int(p.working_days or 0),
                "lop_days": lop_d,
                "lop_amount": round(lop_amt, 2),
                "basic_pay": round(float(p.basic_pay or 0), 2),
                "gross_earnings": round(gross_val, 2),
                "total_deductions": round(ded_val, 2),
                "net_pay": round(net_val, 2),
                "earnings_breakdown": earnings_lines,
                "deductions_breakdown": deduction_lines,
            })

        employee_salaries.sort(key=lambda x: x["net_pay"], reverse=True)

        # Optional single-employee fuzzy filter (when Admin asks "Rahul ki kitni salary bani hai?")
        emp_query_clean = (employee_name_query or "").strip()
        generic_words = {
            "all", "everyone", "everybody", "sab", "sabhi", "sabki", "sabka",
            "kiske", "kiski", "kiska", "who", "employees", "company", "team",
        }
        filtered_by_employee = False
        matched_skipped: list[dict[str, Any]] = []

        if emp_query_clean and emp_query_clean.lower() not in generic_words:
            filtered_by_employee = True
            q_low = emp_query_clean.lower()
            scored_emps: list[tuple[float, dict[str, Any]]] = []
            for item in employee_salaries:
                fn_low = item["employee_name"].lower()
                code_low = (item["employee_code"] or "").lower()
                if q_low == fn_low or q_low == code_low:
                    sc = 100.0
                elif q_low in fn_low or any(t.startswith(q_low) for t in fn_low.split()):
                    sc = 92.0
                elif HAS_RAPIDFUZZ:
                    sc = float(max(fuzz.WRatio(q_low, fn_low), fuzz.partial_ratio(q_low, fn_low)))
                else:
                    sc = SequenceMatcher(None, q_low, fn_low).ratio() * 100.0
                if sc >= 58.0:
                    scored_emps.append((sc, item))

            scored_emps.sort(key=lambda pair: pair[0], reverse=True)
            employee_salaries = [pair[1] for pair in scored_emps[:5]]

            for sk in skipped_employees:
                fn_low = sk["employee_name"].lower()
                if q_low in fn_low or (
                    HAS_RAPIDFUZZ and fuzz.partial_ratio(q_low, fn_low) >= 68
                ):
                    matched_skipped.append(sk)

        # Idea A (Option 1): Attach interactive Finalize Payroll action card if run is in 'draft'
        if run.status == "draft":
            all_run_gross = sum(float(p.gross_earnings or 0) for p in payslips)
            all_run_ded = sum(float(p.gross_deductions or 0) for p in payslips)
            all_run_net = sum(float(p.net_pay or 0) for p in payslips)
            self._add_pending_action({
                "action_id": f"finalize-payroll-{run.id}",
                "action_type": "finalize_payroll",
                "title": f"Finalize Payroll Run — {month_label}",
                "payroll_run_id": str(run.id),
                "month": resolved_month,
                "year": resolved_year,
                "month_label": month_label,
                "payroll_status": run.status,
                "payslip_count": len(payslips),
                "total_gross_earnings": round(all_run_gross, 2),
                "total_deductions": round(all_run_ded, 2),
                "total_net_pay": round(all_run_net, 2),
                "unassigned_employees_count": len(skipped_employees),
            })

        return {
            "payroll_run_id": str(run.id),
            "month": resolved_month,
            "year": resolved_year,
            "month_label": month_label,
            "payroll_status": run.status,
            "action_taken": action_taken,
            "department_filter": department_filter,
            "employee_name_query": emp_query_clean if filtered_by_employee else None,
            "summary": {
                "payslip_count": len(employee_salaries),
                "total_company_payslips": len(payslips),
                "total_gross_earnings": round(total_gross, 2),
                "total_deductions": round(total_deductions, 2),
                "total_net_pay": round(total_net, 2),
                "employees_with_lop_count": total_lop_employees,
                "unassigned_or_skipped_count": len(skipped_employees),
            },
            "employee_salaries": employee_salaries[:50],
            "unassigned_or_skipped_employees": (
                matched_skipped if filtered_by_employee else skipped_employees[:20]
            ),
            "instruction": (
                "Reply strictly in Roman English/Hinglish (NEVER use Hindi Devanagari script). "
                "State whether the payroll run for this month was newly created (Draft) or already existed, "
                "give the summary totals (Total Payslips, Total Gross, Total Deductions, Total Net Pay), "
                "and list each employee's salary breakdown (Gross, Deductions, LOP Days/Amount, and Net Pay) "
                "in clean bullet points. If any active employees were skipped due to missing salary structure "
                "assignment, mention them clearly at the end. If payroll_status is 'draft', remind the Admin "
                "they can click 'Finalize Payroll Run' on the card below to lock and publish payslips."
            ),
        }

    # ══════════════════════════════════════════════════════════════════════
    # EMPLOYEE SELF-SERVICE TOOLS (Strictly Scoped to `self.employee_id`)
    # ══════════════════════════════════════════════════════════════════════

    # ── E1. My Leave Balance & Request Status ────────────────────────────
    def get_my_leave_summary(self, year: int | None = None) -> dict[str, Any]:
        if not self.employee_id:
            return {"error": "Employee profile not linked to current account."}

        today = get_ist_today()
        resolved_year = int(year) if year else today.year

        emp = self.emp_repo.get_by_id(self.employee_id)
        balances = self.leave_bal_repo.get_by_employee(self.employee_id, resolved_year)
        all_types = self.leave_type_repo.get_all()
        bal_by_type_id = {b.leave_type_id: b for b in balances}

        balance_items = []
        total_remaining_paid = 0.0
        for lt in all_types:
            b = bal_by_type_id.get(lt.id)
            rem = float(b.balance) if b else 0.0
            used = self.leave_repo.get_approved_days_by_type(self.employee_id, lt.id, resolved_year)
            entitlement = float(lt.accrual_rate * 12) if lt.accrual_rate is not None else 0.0
            if lt.is_paid:
                total_remaining_paid += rem
            balance_items.append({
                "leave_type_id": str(lt.id),
                "leave_type": lt.name,
                "is_paid": bool(lt.is_paid),
                "remaining_days": rem,
                "used_days": used,
                "annual_entitlement": entitlement,
            })

        my_requests = self.leave_repo.get_by_employee(self.employee_id, skip=0, limit=15)
        request_items = [
            {
                "id": str(r.id),
                "leave_type": r.leave_type.name if r.leave_type else "Leave",
                "start_date": r.start_date.isoformat(),
                "end_date": r.end_date.isoformat(),
                "days": (r.end_date - r.start_date).days + 1,
                "status": r.status,
            }
            for r in my_requests
        ]

        return {
            "employee_name": emp.full_name if emp else "Employee",
            "year": resolved_year,
            "total_remaining_paid_leaves": round(total_remaining_paid, 1),
            "leave_balances": balance_items,
            "recent_leave_requests": request_items,
            "pending_requests_count": sum(1 for r in request_items if r["status"] == "pending"),
            "approved_requests_count": sum(1 for r in request_items if r["status"] == "approved"),
        }

    # ── E2. My Personal Attendance Summary ───────────────────────────────
    def get_my_attendance_summary(
        self,
        month: int | None = None,
        year: int | None = None,
    ) -> dict[str, Any]:
        if not self.employee_id:
            return {"error": "Employee profile not linked to current account."}

        today = get_ist_today()
        resolved_year = int(year) if year else today.year
        resolved_month = int(month) if (month and 1 <= int(month) <= 12) else today.month

        emp = self.emp_repo.get_by_id(self.employee_id)
        _, last_day = calendar.monthrange(resolved_year, resolved_month)
        start_d = date(resolved_year, resolved_month, 1)
        end_d = date(resolved_year, resolved_month, last_day)

        records = self.attendance_svc.repo.get_by_date_range(start_d, end_d, self.employee_id)
        by_date: dict[date, list] = defaultdict(list)
        for rec in records:
            by_date[_local_date(rec.clock_in)].append(rec)

        # Shift lookup for late calculation
        roster = self.shift_repo.get_roster(skip=0, limit=1000)
        my_shift = None
        for assignment in roster:
            if assignment.employee_id == self.employee_id and assignment.shift:
                my_shift = assignment.shift
                break

        if my_shift and my_shift.start_time:
            shift_start_mins = my_shift.start_time.hour * 60 + my_shift.start_time.minute
            shift_label = f"{my_shift.shift_type} ({my_shift.start_time.strftime('%I:%M %p')})"
        else:
            shift_start_mins = 9 * 60
            shift_label = "General Shift (09:00 AM)"
        grace_threshold = shift_start_mins + 15

        daily_logs = []
        late_days = []
        month_total_minutes = 0.0

        for d in sorted(by_date.keys(), reverse=True):
            sessions = sorted(by_date[d], key=lambda r: r.clock_in)
            first_in = sessions[0].clock_in
            if first_in.tzinfo is None:
                first_in = first_in.replace(tzinfo=timezone.utc)
            local_in = first_in + IST_OFFSET
            in_mins = local_in.hour * 60 + local_in.minute

            last_out = sessions[-1].clock_out
            day_mins = 0.0
            for s in sessions:
                if s.clock_out:
                    day_mins += (s.clock_out - s.clock_in).total_seconds() / 60.0
            month_total_minutes += day_mins

            is_late = in_mins > grace_threshold
            late_by = (in_mins - shift_start_mins) if is_late else 0
            if is_late:
                late_days.append({
                    "date": d.isoformat(),
                    "date_formatted": d.strftime("%d %b %Y"),
                    "check_in": local_in.strftime("%I:%M %p IST"),
                    "late_by_minutes": late_by,
                })

            daily_logs.append({
                "date": d.isoformat(),
                "date_formatted": d.strftime("%d %b %Y (%a)"),
                "check_in": format_ist_time(first_in),
                "check_out": format_ist_time(last_out),
                "hours_worked": round(day_mins / 60.0, 2),
                "punctuality": f"Late by {late_by} mins" if is_late else "On Time",
            })

        # Approved leaves overlapping this month
        leaves_in_month = self.leave_repo.get_by_employee_and_date_range(
            self.employee_id, start_d, end_d
        )
        approved_leave_days = 0
        for lr in leaves_in_month:
            if lr.status == "approved":
                s_clip = max(lr.start_date, start_d)
                e_clip = min(lr.end_date, end_d)
                approved_leave_days += max(0, (e_clip - s_clip).days + 1)

        # Today's live status
        today_sessions = sorted(by_date.get(today, []), key=lambda r: r.clock_in)
        if today_sessions:
            today_in = format_ist_time(today_sessions[0].clock_in)
            today_out = format_ist_time(today_sessions[-1].clock_out)
            today_status = "Present (Currently Clocked In)" if not today_sessions[-1].clock_out else "Present (Clocked Out)"
        else:
            today_in = None
            today_out = None
            today_leaves = [
                lr for lr in leaves_in_month
                if lr.start_date <= today <= lr.end_date and lr.status == "approved"
            ]
            today_status = f"On Leave ({today_leaves[0].leave_type.name})" if today_leaves else "Not Clocked In Today"

        month_name = date(resolved_year, resolved_month, 1).strftime("%B %Y")

        return {
            "employee_name": emp.full_name if emp else "Employee",
            "month": month_name,
            "shift": shift_label,
            "today_date": today.strftime("%d %b %Y (%A)"),
            "today_status": today_status,
            "today_check_in": today_in,
            "today_check_out": today_out,
            "summary": {
                "days_present": len(by_date),
                "late_days_count": len(late_days),
                "on_time_days_count": max(0, len(by_date) - len(late_days)),
                "approved_leave_days": approved_leave_days,
                "total_hours_worked": round(month_total_minutes / 60.0, 2),
            },
            "late_arrivals": late_days[:10],
            "recent_daily_logs": daily_logs[:15],
        }

    # ── E3. Prepare My Leave Application Card (Employee Action) ──────────
    def prepare_my_leave_application(
        self,
        leave_type_query: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        reason: str | None = None,
    ) -> dict[str, Any]:
        if not self.employee_id:
            return {"error": "Employee profile not linked to current account."}

        today = get_ist_today()
        tomorrow = today + timedelta(days=1)

        s_date = parse_iso_date(start_date, default=tomorrow, prefer_future=True)
        if s_date < today:
            s_date = tomorrow
        e_date = parse_iso_date(end_date, default=s_date, prefer_future=True)
        if e_date < s_date:
            e_date = s_date

        days_requested = (e_date - s_date).days + 1

        all_types = self.leave_type_repo.get_all()
        if not all_types:
            return {"error": "No leave types are configured in the system yet."}

        balances = self.leave_bal_repo.get_by_employee(self.employee_id, s_date.year)
        bal_by_type_id = {b.leave_type_id: float(b.balance) for b in balances}

        leave_options = []
        for lt in all_types:
            leave_options.append({
                "id": str(lt.id),
                "name": lt.name,
                "is_paid": bool(lt.is_paid),
                "balance": bal_by_type_id.get(lt.id, 0.0),
            })

        # Match the requested leave type or pick best available
        q_lt = (leave_type_query or "").strip().lower()
        selected_lt = None
        if q_lt:
            for opt in leave_options:
                if q_lt in opt["name"].lower() or opt["name"].lower() in q_lt:
                    selected_lt = opt
                    break
            if not selected_lt:
                # Common Hinglish/keyword aliases
                if any(w in q_lt for w in ("sick", "medical", "fever", "ill", "tabiyat", "bimari")):
                    selected_lt = next((o for o in leave_options if "sick" in o["name"].lower() or "medical" in o["name"].lower()), None)
                elif any(w in q_lt for w in ("casual", "personal", "urgent", "family")):
                    selected_lt = next((o for o in leave_options if "casual" in o["name"].lower()), None)
                elif any(w in q_lt for w in ("earned", "privilege", "paid", "annual", "vacation")):
                    selected_lt = next((o for o in leave_options if any(k in o["name"].lower() for k in ("earned", "privilege", "annual", "paid"))), None)
                elif any(w in q_lt for w in ("unpaid", "lop", "loss")):
                    selected_lt = next((o for o in leave_options if not o["is_paid"] or "unpaid" in o["name"].lower()), None)

        if not selected_lt:
            # Prefer a paid leave type that has enough balance, else first leave type
            selected_lt = next(
                (o for o in leave_options if o["is_paid"] and o["balance"] >= days_requested),
                leave_options[0],
            )

        # Check overlapping requests
        overlapping = self.leave_repo.get_by_employee_and_date_range(
            self.employee_id, s_date, e_date
        )
        overlap_warning = None
        if overlapping:
            overlap_warning = (
                f"Note: You already have an existing {overlapping[0].status} leave request "
                f"from {overlapping[0].start_date.isoformat()} to {overlapping[0].end_date.isoformat()}."
            )

        card = {
            "action_id": f"apply-leave-{selected_lt['id']}-{s_date.isoformat()}-{e_date.isoformat()}",
            "action_type": "apply_leave",
            "title": "Confirm Leave Application",
            "leave_type_id": selected_lt["id"],
            "leave_type_name": selected_lt["name"],
            "start_date": s_date.isoformat(),
            "end_date": e_date.isoformat(),
            "days": days_requested,
            "available_balance": selected_lt["balance"],
            "reason": reason or "Requested via Meagle 360 AI Assistant",
            "leave_type_options": leave_options,
        }
        self._add_pending_action(card)

        return {
            "prepared": True,
            "leave_type": selected_lt["name"],
            "start_date": s_date.isoformat(),
            "start_date_formatted": s_date.strftime("%d %b %Y (%A)"),
            "end_date": e_date.isoformat(),
            "end_date_formatted": e_date.strftime("%d %b %Y (%A)"),
            "days": days_requested,
            "available_balance": selected_lt["balance"],
            "overlap_warning": overlap_warning,
            "instruction": (
                "Confirm the prepared leave details (Leave Type, Start Date, End Date, Total Days, "
                "and Remaining Balance) clearly and ask the employee to click the "
                "'Confirm & Apply Leave' button below the message to submit their request."
            ),
        }

    # ── E4. My Personal Payslip & Salary Breakdown (Idea D) ──────────────
    def get_my_payslip_summary(
        self,
        month: int | str | None = None,
        year: int | None = None,
    ) -> dict[str, Any]:
        if not self.employee_id:
            return {"error": "Employee profile not linked to current account."}

        resolved_month, resolved_year = parse_month_year(month=month, year=year)
        month_label = date(resolved_year, resolved_month, 1).strftime("%B %Y")

        emp = self.emp_repo.get_by_id(self.employee_id)
        emp_name = emp.full_name if emp else "Employee"
        all_my_payslips = self.payroll_svc.payslip_repo.get_for_employee(self.employee_id, limit=24)

        target_payslip = None
        for p in all_my_payslips:
            if p.payroll_run and p.payroll_run.year == resolved_year and p.payroll_run.month == resolved_month:
                target_payslip = p
                break

        recent_history = [
            {
                "month_label": date(p.payroll_run.year, p.payroll_run.month, 1).strftime("%B %Y"),
                "payslip_number": p.payslip_number,
                "status": p.payroll_run.status,
                "gross_earnings": round(float(p.gross_earnings or 0), 2),
                "total_deductions": round(float(p.gross_deductions or 0), 2),
                "lop_days": float(p.lop_days or 0),
                "net_pay": round(float(p.net_pay or 0), 2),
            }
            for p in all_my_payslips[:6]
            if p.payroll_run
        ]

        if target_payslip:
            run_status = target_payslip.payroll_run.status if target_payslip.payroll_run else "generated"
            earnings_lines = [
                {"component": ln.component_name, "amount": round(float(ln.amount), 2)}
                for ln in (target_payslip.lines or [])
                if ln.component_type == "earning"
            ]
            deduction_lines = [
                {"component": ln.component_name, "amount": round(float(ln.amount), 2)}
                for ln in (target_payslip.lines or [])
                if ln.component_type == "deduction"
            ]
            return {
                "employee_name": emp_name,
                "month": resolved_month,
                "year": resolved_year,
                "month_label": month_label,
                "source": "official_payslip",
                "payroll_status": run_status,
                "payslip_number": target_payslip.payslip_number,
                "working_days": int(target_payslip.working_days or 0),
                "lop_days": float(target_payslip.lop_days or 0),
                "lop_amount": round(float(target_payslip.lop_amount or 0), 2),
                "basic_pay": round(float(target_payslip.basic_pay or 0), 2),
                "gross_earnings": round(float(target_payslip.gross_earnings or 0), 2),
                "total_deductions": round(float(target_payslip.gross_deductions or 0), 2),
                "net_pay": round(float(target_payslip.net_pay or 0), 2),
                "earnings_breakdown": earnings_lines,
                "deductions_breakdown": deduction_lines,
                "recent_payslips": recent_history,
            }

        # If official payroll run is not generated yet for that month, compute live estimate from assignment
        _, last_day = calendar.monthrange(resolved_year, resolved_month)
        as_of = date(resolved_year, resolved_month, last_day)
        assignment = self.payroll_svc.assignment_repo.get_current_for_employee(self.employee_id, as_of=as_of)

        if not assignment or not emp:
            return {
                "employee_name": emp_name,
                "month": resolved_month,
                "year": resolved_year,
                "month_label": month_label,
                "source": "not_assigned",
                "message": (
                    f"No payslip or salary structure assignment was found for {month_label}. "
                    "Please contact HR/Admin to assign your salary structure."
                ),
                "recent_payslips": recent_history,
            }

        try:
            company = self.payroll_svc._get_company()
            calc = self.payroll_svc._compute_payslip_for_employee(
                emp, assignment, resolved_year, resolved_month, company
            )
            earnings_lines = [
                {"component": name, "amount": round(float(amt), 2)}
                for name, ctype, amt in calc["lines"]
                if ctype == "earning"
            ]
            deduction_lines = [
                {"component": name, "amount": round(float(amt), 2)}
                for name, ctype, amt in calc["lines"]
                if ctype == "deduction"
            ]
            return {
                "employee_name": emp_name,
                "month": resolved_month,
                "year": resolved_year,
                "month_label": month_label,
                "source": "live_estimate",
                "payroll_status": "estimated (Official payroll run not generated by HR yet)",
                "working_days": int(calc["working_days"]),
                "lop_days": float(calc["lop_days"]),
                "lop_amount": round(float(calc["lop_amount"]), 2),
                "basic_pay": round(float(calc["basic_pay"]), 2),
                "gross_earnings": round(float(calc["gross_earnings"]), 2),
                "total_deductions": round(float(calc["gross_deductions"]), 2),
                "net_pay": round(float(calc["net_pay"]), 2),
                "earnings_breakdown": earnings_lines,
                "deductions_breakdown": deduction_lines,
                "recent_payslips": recent_history,
            }
        except ValueError as exc:
            return {
                "employee_name": emp_name,
                "month": resolved_month,
                "year": resolved_year,
                "month_label": month_label,
                "source": "error",
                "error": str(exc),
                "recent_payslips": recent_history,
            }

