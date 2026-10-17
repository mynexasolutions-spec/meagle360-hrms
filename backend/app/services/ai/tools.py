"""Read-only HRMS tools for the Org Admin AI Assistant.

Security invariants:
- `company_id` is bound in `AIToolbox.__init__` from the verified JWT token.
  It is NEVER accepted from LLM tool arguments.
- All database queries go through company-scoped repositories/services.
- Sensitive PII (salary, PAN, UAN, bank account, personal phone/address) is
  never included in tool outputs sent to the LLM.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from difflib import SequenceMatcher
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.repositories.attendance_regularization_repo import AttendanceRegularizationRepository
from app.repositories.employee_repo import EmployeeRepository
from app.repositories.leave_repo import LeaveBalanceRepository, LeaveRequestRepository
from app.repositories.shift_repo import EmployeeShiftRepository
from app.services.attendance_service import AttendanceService, IST_OFFSET, _local_date

try:
    from rapidfuzz import fuzz, process as rf_process  # type: ignore
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


def parse_iso_date(val: str | None, default: date | None = None) -> date:
    if not val:
        return default or get_ist_today()
    cleaned = val.strip().lower()
    today = get_ist_today()
    if cleaned in ("today", "aaj", "now"):
        return today
    if cleaned in ("yesterday", "kal"):
        return today - timedelta(days=1)
    if cleaned in ("tomorrow",):
        return today + timedelta(days=1)
    try:
        return date.fromisoformat(cleaned[:10])
    except ValueError:
        return default or today


# ── OpenAI / Groq Function-Calling Tool Schemas ──────────────────────────

TOOL_SCHEMAS: list[dict[str, Any]] = [
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
                "Get employees who are on approved or pending leave for a single date or date range "
                "(e.g. today, tomorrow, or next week)."
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
                "waiting for Admin/Manager approval."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


class AIToolbox:
    """Executes read-only HRMS tools strictly scoped to `company_id`."""

    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id
        self.attendance_svc = AttendanceService(db, company_id)
        self.emp_repo = EmployeeRepository(db, company_id)
        self.leave_repo = LeaveRequestRepository(db, company_id)
        self.leave_bal_repo = LeaveBalanceRepository(db, company_id)
        self.shift_repo = EmployeeShiftRepository(db, company_id)
        self.reg_repo = AttendanceRegularizationRepository(db, company_id)

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
            return self.get_pending_approvals()
        return {"error": f"Unknown tool: {tool_name}"}

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
                "currently_in_office_count": len(clocked_in_now_rows),
                "on_leave_count": len(on_leave_rows),
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
            items.append({
                "employee_name": emp.full_name if emp else "Unknown",
                "employee_code": emp.employee_code if emp else None,
                "department": emp_dept,
                "leave_type": lr.leave_type.name if lr.leave_type else "Leave",
                "status": lr.status,
                "start_date": lr.start_date.isoformat(),
                "end_date": lr.end_date.isoformat(),
                "days": days_count,
                "reason": getattr(lr, "reason", None),
            })

        approved_list = [i for i in items if i["status"] == "approved"]
        pending_list = [i for i in items if i["status"] == "pending"]

        return {
            "start_date": s_date.isoformat(),
            "end_date": e_date.isoformat(),
            "department_filter": department_filter,
            "total_matching_requests": len(items),
            "approved_count": len(approved_list),
            "pending_count": len(pending_list),
            "leaves": items,
        }

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
    def get_pending_approvals(self) -> dict[str, Any]:
        pending_leaves = self.leave_repo.get_pending(skip=0, limit=30)
        pending_regs = self.reg_repo.get_pending(skip=0, limit=30)

        leave_items = [
            {
                "employee_name": lr.employee.full_name if lr.employee else "Unknown",
                "leave_type": lr.leave_type.name if lr.leave_type else "Leave",
                "start_date": lr.start_date.isoformat(),
                "end_date": lr.end_date.isoformat(),
                "days": (lr.end_date - lr.start_date).days + 1,
                "reason": getattr(lr, "reason", None),
            }
            for lr in pending_leaves
        ]

        reg_items = [
            {
                "employee_name": r.employee.full_name if r.employee else "Unknown",
                "record_date": r.record_date.isoformat() if r.record_date else None,
                "reason": r.reason,
            }
            for r in pending_regs
        ]

        return {
            "pending_leave_requests_count": len(leave_items),
            "pending_regularizations_count": len(reg_items),
            "pending_leave_requests": leave_items,
            "pending_regularizations": reg_items,
        }
