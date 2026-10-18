"""AI Agent Service — orchestrates role-aware tool calling + local deterministic fallback."""

from __future__ import annotations

import json
import logging
import re
from datetime import timedelta
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.services.ai.llm_client import LLMClient, LLMProviderError
from app.services.ai.tools import (
    ADMIN_TOOL_SCHEMAS,
    EMPLOYEE_TOOL_SCHEMAS,
    AIToolbox,
    extract_date_window_from_query,
    get_ist_now,
    get_ist_today,
    parse_month_year,
)

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 3


def build_system_prompt(is_admin_or_manager: bool = True) -> str:
    now_ist = get_ist_now()
    today_str = now_ist.strftime("%Y-%m-%d (%A)")
    time_str = now_ist.strftime("%I:%M %p IST")
    yesterday_str = (now_ist.date() - timedelta(days=1)).isoformat()
    tomorrow_str = (now_ist.date() + timedelta(days=1)).isoformat()

    if not is_admin_or_manager:
        return (
            "You are Meagle 360 AI — Personal HR Assistant for an Employee.\n"
            f"- Current IST Date: {today_str}\n"
            f"- Current IST Time: {time_str}\n"
            f"- Yesterday: {yesterday_str} | Tomorrow: {tomorrow_str}\n\n"
            "STRICT RULES FOR EMPLOYEE MODE:\n"
            "1. LANGUAGE: Always reply in clear, concise, friendly Roman English (or Roman Hinglish if natural), "
            "regardless of whether the employee asks in English, Hindi, or Hinglish. NEVER use Hindi Devanagari "
            "script characters (क, ख, ग, etc.) anywhere in your response.\n"
            "2. PERSONAL SCOPE ONLY: You can ONLY access this logged-in employee's own data:\n"
            "   - Their own Salary / Payslip breakdown (`get_my_payslip_summary`)\n"
            "   - Their own Leave Balance & Leave Request status (`get_my_leave_summary`)\n"
            "   - Their own Personal Attendance record & check-in/out times (`get_my_attendance_summary`)\n"
            "   - Preparing a Leave Application for them (`prepare_my_leave_application`)\n"
            "3. PRIVACY GUARDRAIL: If the employee asks about company-wide attendance, company-wide payroll, "
            "another employee's salary/attendance, or who is present/late in a department, politely tell them "
            "that company/team records and other employees' salaries are restricted to Organization Admins and "
            "Managers, and offer to check their own salary/payslip, attendance, leave balance, or help them apply for leave.\n"
            "4. MY SALARY / PAYSLIP: Whenever the employee asks about their salary, payslip, tankhwah, net pay, "
            "deductions, or LOP (e.g. 'meri is mahine ki salary kitni bani hai?', 'show my payslip'), ALWAYS call "
            "`get_my_payslip_summary`.\n"
            "5. APPLYING FOR LEAVE: Whenever the employee says they want to apply for leave, take a day off, "
            "or book chhutti (e.g. 'apply sick leave tomorrow', 'mujhe kal chhutti chahiye', 'apply casual leave "
            "from 20 Oct to 22 Oct'), ALWAYS call `prepare_my_leave_application` so an interactive "
            "'Confirm & Apply Leave' button card appears below your reply.\n"
            "6. FORMATTING: Never output Markdown tables (`|---|`) or horizontal divider lines (`---`). "
            "Use clean bullet points (`- **Label:** Value`) so replies look great and read smoothly aloud."
        )

    return (
        "You are Meagle 360 AI for Organization Admins and HR Managers.\n"
        f"- Current IST Date: {today_str}\n"
        f"- Current IST Time: {time_str}\n"
        f"- Yesterday: {yesterday_str} | Tomorrow: {tomorrow_str}\n\n"
        "STRICT RULES:\n"
        "1. LANGUAGE (NO HINDI LETTERS): Always reply strictly in Roman alphabet (clear, concise, professional "
        "English / Hinglish). NEVER output any Hindi Devanagari script characters (क, ख, ग, etc.).\n"
        "2. VOICE & TYPO TOLERANCE: User queries often come from speech-to-text (Whisper/Mic) and may "
        "contain phonetic typos or Hinglish (e.g. 'pleasant'/'preset'/'prasent' -> 'present', "
        "'engine ring' -> 'Engineering', 'let'/'leit' -> 'late', 'chuti'/'live' -> 'leave', "
        "'pay roll'/'perol'/'tankhwah' -> 'payroll'/'salary', or misspelled Indian names like 'Rahu'/'Sidhart'). "
        "Always interpret imperfect transcripts generously and call the matching tool.\n"
        "3. PAYROLL GENERATION & SALARY BREAKDOWN: Whenever the Admin/Manager asks to generate/create/run "
        "payroll OR asks how much salary was calculated in payroll for everyone or a specific employee "
        "(e.g. 'payroll bana do', 'is mahine ka payroll bana do', 'kiske payroll mein kitni salary bani hai', "
        "'Rahul ki kitni salary bani hai', 'show payroll breakdown for October'), ALWAYS call "
        "`run_or_get_monthly_payroll`.\n"
        "   - State clearly whether the Draft payroll run was newly generated or already existed (and its status: DRAFT or FINALIZED).\n"
        "   - Show the summary totals (Total Payslips, Total Gross, Total Deductions, Total Net Payout).\n"
        "   - List each employee's salary breakdown in clean bullet points: **Employee Name** (Department) — "
        "Gross: ₹X, Deductions: ₹Y, LOP: Z days (₹W), **Net Pay: ₹N** (or full itemized earnings/deductions if a single employee was queried).\n"
        "   - If `unassigned_or_skipped_employees` has entries, include a clear note at the end listing those active employees who do not have a Salary Structure assigned yet.\n"
        "   - If `payroll_status` is 'draft', remind the Admin they can click the **Finalize Payroll Run** button on the card below.\n"
        "4. LEAVE APPROVALS & STRICT DATE FILTERING: When the Admin/Manager asks to approve or reject a leave (e.g. "
        "'Approve Rahul's leave', 'Emily ki leave approve kar do', 'Reject pending leave') or asks "
        "what leave approvals are pending, call `prepare_leave_approval_action` or `get_pending_approvals`. "
        "   - CRITICAL: If the user asks whether any leave request came in a specific date range or relative period "
        "(e.g. 'pichle 2 din mein koi leave request aayi thi?', 'last 2 days', 'yesterday', 'today'), ONLY report "
        "leave requests that fall within that exact date range. If there are 0 leave requests in that date range, "
        "directly say that no leave requests were found for those dates — NEVER list, mention, or show leave requests from other dates!\n"
        "5. ACCURACY: Never guess or fabricate employee names, salary figures, counts, times, or dates. Every number, "
        "name, and amount in your answer MUST come strictly from the tool output.\n"
        "6. PINPOINT FILTERING: If the user asks about a specific department (e.g. 'in Engineering') or "
        "a specific status ('who is present', 'who is absent', 'who is late'), pass `department_filter` "
        "and/or `status_filter` to the tool and ONLY answer what was asked — do not dump the full company overview unless asked for an overview.\n"
        "7. FORMATTING (NO TABLES, NO DASH LINES): NEVER output Markdown tables (`|---|`), pipe characters (`|`), "
        "or horizontal divider lines (`---`). Always start your answer with a 1-line summary header followed by clean bullet points."
    )


def _sanitize_reply(text: str) -> str:
    """Convert any residual Markdown table rows into clean bullet lines, remove '---' dividers,
    and strip any stray Devanagari Unicode characters so output is strictly Roman script."""
    if not text:
        return ""
    # Strip any stray Devanagari script characters while preserving ₹ (U+20B9) and Roman text
    cleaned_text = re.sub(r"[\u0900-\u097F]+", "", text)
    out_lines: list[str] = []
    lines = cleaned_text.splitlines()
    for line in lines:
        stripped = line.strip()
        if re.match(r"^[\|\s:\-_]{3,}$", stripped):
            continue
        if stripped.startswith("|") and stripped.endswith("|"):
            cells = [c.strip() for c in stripped.strip("|").split("|") if c.strip()]
            if not cells:
                continue
            lower_cells = [re.sub(r"\*+", "", c).strip().lower() for c in cells]
            if any(h in lower_cells for h in ("employee", "employee name", "name", "component")) and any(
                h in lower_cells
                for h in (
                    "department", "status", "check-in", "check in", "late by",
                    "leave type", "net pay", "gross", "salary", "amount",
                )
            ):
                continue
            first = cells[0]
            if not first.startswith("**"):
                first = f"**{first}**"
            rest = " • ".join(cells[1:])
            out_lines.append(f"- {first}" + (f" — {rest}" if rest else ""))
            continue
        out_lines.append(line)
    return "\n".join(out_lines).strip()


class AIAgentService:
    """Runs the function-calling agent loop scoped to the authenticated tenant and role."""

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
        self.role_mode = "admin" if is_admin_or_manager else "employee"
        self.toolbox = AIToolbox(
            db=db,
            company_id=company_id,
            employee_id=employee_id,
            is_admin_or_manager=is_admin_or_manager,
        )
        self.llm = LLMClient()

    def chat(
        self,
        user_message: str,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        clean_msg = (user_message or "").strip()
        if not clean_msg:
            default_prompt = (
                "Please ask a question about attendance, leaves, late comers, or pending approvals."
                if self.is_admin_or_manager
                else "Please ask about your leave balance, your attendance, or ask me to apply for leave."
            )
            return {
                "reply": default_prompt,
                "tools_used": [],
                "pending_actions": [],
                "role_mode": self.role_mode,
                "provider": self.llm.provider,
                "mode": "empty",
            }

        self.toolbox.current_user_query = clean_msg
        tools_used: list[str] = []

        # If LLM key is configured, run full function-calling loop with graceful fallback
        if self.llm.is_configured:
            try:
                return self._run_llm_agent_loop(clean_msg, history or [], tools_used)
            except LLMProviderError as exc:
                logger.warning(
                    "LLM provider failed (%s); falling back to deterministic tool responder.",
                    exc,
                )

        # Deterministic Local Tool Engine (works when GROQ_API_KEY is not set or on rate-limit)
        if not self.is_admin_or_manager:
            return self._run_employee_deterministic_fallback(clean_msg)
        return self._run_admin_deterministic_fallback(clean_msg)

    def _run_llm_agent_loop(
        self,
        user_message: str,
        history: list[dict[str, str]],
        tools_used: list[str],
    ) -> dict[str, Any]:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": build_system_prompt(self.is_admin_or_manager)}
        ]

        for turn in history[-6:]:
            role = turn.get("role")
            content = turn.get("content")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": str(content)[:1500]})

        messages.append({"role": "user", "content": user_message})
        schemas = ADMIN_TOOL_SCHEMAS if self.is_admin_or_manager else EMPLOYEE_TOOL_SCHEMAS

        for _ in range(MAX_TOOL_ITERATIONS):
            assistant_msg = self.llm.chat(messages=messages, tools=schemas)
            tool_calls = assistant_msg.get("tool_calls")

            if not tool_calls:
                reply_text = _sanitize_reply((assistant_msg.get("content") or "").strip())
                if not reply_text:
                    reply_text = "I checked your HRMS records, but couldn't generate a response."
                return {
                    "reply": reply_text,
                    "tools_used": tools_used,
                    "pending_actions": self.toolbox.pending_actions,
                    "role_mode": self.role_mode,
                    "provider": self.llm.provider,
                    "mode": "llm",
                }

            messages.append({
                "role": "assistant",
                "content": assistant_msg.get("content") or "",
                "tool_calls": tool_calls,
            })

            for tc in tool_calls:
                fn = tc.get("function") or {}
                tool_name = fn.get("name", "")
                raw_args = fn.get("arguments") or "{}"
                try:
                    parsed_args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except json.JSONDecodeError:
                    parsed_args = {}

                if tool_name and tool_name not in tools_used:
                    tools_used.append(tool_name)

                tool_output = self.toolbox.execute(tool_name, parsed_args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id", "call_1"),
                    "name": tool_name,
                    "content": json.dumps(tool_output, default=str),
                })

        final_msg = self.llm.chat(messages=messages, tools=None)
        return {
            "reply": _sanitize_reply((final_msg.get("content") or "").strip()),
            "tools_used": tools_used,
            "pending_actions": self.toolbox.pending_actions,
            "role_mode": self.role_mode,
            "provider": self.llm.provider,
            "mode": "llm",
        }

    # ══════════════════════════════════════════════════════════════════════
    # EMPLOYEE DETERMINISTIC FALLBACK
    # ══════════════════════════════════════════════════════════════════════
    def _run_employee_deterministic_fallback(self, user_message: str) -> dict[str, Any]:
        q = user_message.lower().strip()

        # Guardrail if employee asks about company/department attendance, company payroll, or other employees
        if any(
            phrase in q
            for phrase in (
                "who is present",
                "who came late",
                "who is on leave",
                "who is absent",
                "pending approvals",
                "in engineering",
                "in sales",
                "in hr",
                "in finance",
                "kaun aaya",
                "kaun chhutti",
                "kaun late",
                "kiske payroll",
                "kiski salary",
                "sabki salary",
                "everyone's salary",
                "payroll bana",
                "generate payroll",
                "run payroll",
            )
        ):
            return {
                "reply": (
                    "Company-wide attendance, payroll runs, and other employees' salary records are restricted to "
                    "**Organization Admins and HR Managers**.\n\n"
                    "As an Employee, I can help you with:\n"
                    "- **Your Salary / Payslip:** *\"Meri is mahine ki salary kitni bani hai?\"* or *\"Show my payslip\"*\n"
                    "- **Your Leave Balance:** *\"What is my leave balance?\"*\n"
                    "- **Your Attendance:** *\"How is my attendance this month?\"*\n"
                    "- **Apply for Leave:** *\"Apply sick leave for tomorrow\"* or *\"Apply casual leave from 20 Oct to 22 Oct\"*"
                ),
                "tools_used": [],
                "pending_actions": [],
                "role_mode": "employee",
                "provider": "local-db-engine",
                "mode": "deterministic_fallback",
            }

        # 0. Personal Salary / Payslip Intent (Idea D)
        if any(
            w in q
            for w in (
                "salary",
                "payslip",
                "pay slip",
                "payroll",
                "tankhwah",
                "tankhah",
                "net pay",
                "gross pay",
                "deduction",
                "ctc",
                "kitni bani",
                "kitna bana",
                "meri salary",
            )
        ):
            m_val, y_val = parse_month_year(query_text=user_message)
            data = self.toolbox.get_my_payslip_summary(month=m_val, year=y_val)
            if data.get("error"):
                return {
                    "reply": f"**Unable to fetch payslip:** {data['error']}",
                    "tools_used": ["get_my_payslip_summary"],
                    "pending_actions": [],
                    "role_mode": "employee",
                    "provider": "local-db-engine",
                    "mode": "deterministic_fallback",
                }
            if data.get("source") == "not_assigned":
                return {
                    "reply": data["message"],
                    "tools_used": ["get_my_payslip_summary"],
                    "pending_actions": [],
                    "role_mode": "employee",
                    "provider": "local-db-engine",
                    "mode": "deterministic_fallback",
                }

            status_badge = str(data.get("payroll_status", "generated")).upper()
            lines = [
                f"**Your Salary & Payslip Breakdown for {data['month_label']} ({data['employee_name']}) — [{status_badge}]:**",
                f"- **Working Days:** {data['working_days']} days | **LOP Days:** {data['lop_days']} days (LOP Deduction: **₹{data['lop_amount']:,.2f}**)",
                f"- **Basic Pay:** ₹{data['basic_pay']:,.2f}",
                f"- **Gross Earnings:** ₹{data['gross_earnings']:,.2f}",
                f"- **Total Deductions:** ₹{data['total_deductions']:,.2f}",
                f"- **Net Take-Home Salary (Net Pay):** **₹{data['net_pay']:,.2f}**",
            ]
            if data.get("earnings_breakdown"):
                earn_str = ", ".join(
                    f"{e['component']}: ₹{e['amount']:,.2f}" for e in data["earnings_breakdown"]
                )
                lines.append(f"- **Earnings Components:** {earn_str}")
            if data.get("deductions_breakdown"):
                ded_str = ", ".join(
                    f"{d['component']}: ₹{d['amount']:,.2f}" for d in data["deductions_breakdown"]
                )
                lines.append(f"- **Deduction Components:** {ded_str}")

            return {
                "reply": "\n".join(lines),
                "tools_used": ["get_my_payslip_summary"],
                "pending_actions": [],
                "role_mode": "employee",
                "provider": "local-db-engine",
                "mode": "deterministic_fallback",
            }

        # 1. Apply Leave Intent
        is_apply_intent = any(
            w in q
            for w in (
                "apply",
                "request leave",
                "take leave",
                "want leave",
                "need leave",
                "chhutti chahiye",
                "chutti chahiye",
                "leave laga",
                "chhutti laga",
                "chutti laga",
                "book leave",
                "leave for tomorrow",
                "leave tomorrow",
                "kal ki leave",
                "kal ki chhutti",
                "kal chhutti",
            )
        )
        if is_apply_intent:
            # Extract dates if present
            today = get_ist_today()
            start_str = "tomorrow"
            end_str = None

            iso_dates = re.findall(r"\b(\d{4}-\d{2}-\d{2})\b", q)
            if len(iso_dates) >= 2:
                start_str, end_str = iso_dates[0], iso_dates[1]
            elif len(iso_dates) == 1:
                start_str = iso_dates[0]
            else:
                text_dates = re.findall(
                    r"\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\b",
                    q,
                )
                if len(text_dates) >= 2:
                    start_str, end_str = text_dates[0], text_dates[1]
                elif len(text_dates) == 1:
                    start_str = text_dates[0]
                elif "today" in q or "aaj" in q:
                    start_str = "today"
                elif ("kal" in q and "parso" in q) or "2 days" in q or "do din" in q:
                    start_str = (today + timedelta(days=1)).isoformat()
                    end_str = (today + timedelta(days=2)).isoformat()
                elif "parso" in q or "day after tomorrow" in q:
                    start_str = "parso"

            reason_match = re.search(r"(?:because|for|reason|kyunki|due to)\s+(.+)$", user_message, re.I)
            reason = reason_match.group(1).strip() if reason_match else None

            res = self.toolbox.prepare_my_leave_application(
                leave_type_query=q,
                start_date=start_str,
                end_date=end_str,
                reason=reason,
            )
            if res.get("error"):
                return {
                    "reply": f"**Unable to prepare leave request:** {res['error']}",
                    "tools_used": ["prepare_my_leave_application"],
                    "pending_actions": [],
                    "role_mode": "employee",
                    "provider": "local-db-engine",
                    "mode": "deterministic_fallback",
                }

            lines = [
                f"I have prepared your **{res['leave_type']}** application for **{res['days']} day(s)**:",
                f"- **Leave Type:** {res['leave_type']} (Available Balance: **{res['available_balance']} days**)",
                f"- **Dates:** {res['start_date_formatted']} to {res['end_date_formatted']}",
            ]
            if res.get("overlap_warning"):
                lines.append(f"- ⚠️ {res['overlap_warning']}")
            lines.append(
                "\nPlease review the details in the card below and click **Confirm & Apply Leave** to submit your request."
            )
            return {
                "reply": "\n".join(lines),
                "tools_used": ["prepare_my_leave_application"],
                "pending_actions": self.toolbox.pending_actions,
                "role_mode": "employee",
                "provider": "local-db-engine",
                "mode": "deterministic_fallback",
            }

        # 2. Personal Attendance Intent
        if any(
            w in q
            for w in (
                "attendance",
                "present",
                "check-in",
                "check in",
                "clock",
                "late",
                "hours",
                "shift",
                "kitne din",
                "kab aaya",
                "meri attendance",
            )
        ):
            data = self.toolbox.get_my_attendance_summary()
            s = data["summary"]
            lines = [
                f"**Your Personal Attendance Summary for {data['month']} ({data['employee_name']}):**",
                f"- **Today ({data['today_date']}):** {data['today_status']}"
                + (f" — Check-in: **{data['today_check_in']}**" if data.get("today_check_in") else ""),
                f"- **Assigned Shift:** {data['shift']}",
                f"- **Days Present This Month:** {s['days_present']} day(s) ({s['on_time_days_count']} On Time, {s['late_days_count']} Late)",
                f"- **Approved Leave Days This Month:** {s['approved_leave_days']} day(s)",
                f"- **Total Hours Worked:** {s['total_hours_worked']} hrs",
            ]
            if data["recent_daily_logs"]:
                lines.append("\n**Your Recent Attendance Logs:**")
                for log in data["recent_daily_logs"][:7]:
                    out_txt = f", Out: {log['check_out']}" if log["check_out"] else " (Active)"
                    lines.append(
                        f"- **{log['date_formatted']}** — In: **{log['check_in']}**{out_txt} • {log['hours_worked']} hrs ({log['punctuality']})"
                    )
            return {
                "reply": "\n".join(lines),
                "tools_used": ["get_my_attendance_summary"],
                "pending_actions": [],
                "role_mode": "employee",
                "provider": "local-db-engine",
                "mode": "deterministic_fallback",
            }

        # 3. Default / Leave Balance & Leave Status Intent
        data = self.toolbox.get_my_leave_summary()
        lines = [
            f"**Your Leave Balance & Status ({data['year']}) — {data['employee_name']}:**",
            f"- **Total Paid Leave Balance Remaining:** **{data['total_remaining_paid_leaves']} days**",
        ]
        for b in data["leave_balances"]:
            tag = "Paid" if b["is_paid"] else "Unpaid / LOP"
            lines.append(
                f"- **{b['leave_type']} ({tag}):** **{b['remaining_days']} days available** (Used: {b['used_days']}d / Annual: {b['annual_entitlement']}d)"
            )

        if data["recent_leave_requests"]:
            lines.append("\n**Your Recent Leave Applications:**")
            for r in data["recent_leave_requests"][:6]:
                lines.append(
                    f"- **{r['leave_type']}** ({r['start_date']} to {r['end_date']}, {r['days']}d) — Status: **{r['status'].upper()}**"
                )
        else:
            lines.append("\nYou have no recent leave applications. Say *\"Apply casual leave for tomorrow\"* anytime to apply!")

        return {
            "reply": "\n".join(lines),
            "tools_used": ["get_my_leave_summary"],
            "pending_actions": [],
            "role_mode": "employee",
            "provider": "local-db-engine",
            "mode": "deterministic_fallback",
        }

    # ══════════════════════════════════════════════════════════════════════
    # ADMIN / MANAGER DETERMINISTIC FALLBACK
    # ══════════════════════════════════════════════════════════════════════
    def _run_admin_deterministic_fallback(self, user_message: str) -> dict[str, Any]:
        q = user_message.lower().strip()
        self.toolbox.current_user_query = user_message
        today = get_ist_today()

        date_window = extract_date_window_from_query(user_message)
        if date_window:
            win_start, win_end = date_window
            target_date = win_start if win_start == win_end else today
        else:
            target_date = today
            if any(w in q for w in ("yesterday", "kal")):
                target_date = today - timedelta(days=1)
            else:
                iso_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", q)
                if iso_match:
                    try:
                        from datetime import date as dt_date
                        target_date = dt_date.fromisoformat(iso_match.group(1))
                    except ValueError:
                        pass

        date_str = target_date.isoformat()
        dept_filter = self.toolbox.detect_department(q)
        dept_label = f" in **{dept_filter}**" if dept_filter else ""

        # 0. Payroll Generation & Salary Breakdown Intent (Ideas A, B, C)
        if any(
            w in q
            for w in (
                "payroll",
                "pay roll",
                "perol",
                "salary",
                "salaries",
                "tankhwah",
                "tankhah",
                "payslip",
                "pay slip",
                "net pay",
                "gross pay",
                "ctc",
            )
        ):
            m_val, y_val = parse_month_year(query_text=user_message)
            # Detect if a specific employee name was mentioned (e.g., "Rahul ki kitni salary bani hai")
            cleaned_emp = re.sub(
                r"\b(payroll|pay|roll|perol|salary|salaries|tankhwah|tankhah|payslip|slip|net|gross|ctc|bana|banao|banade|banado|create|generate|run|show|tell|check|what|is|the|for|of|in|this|last|previous|month|year|mahine|mahina|pichle|pichhle|kiske|kiski|kiska|kitni|kitna|bani|bana|hai|hain|aur|batao|bata|do|de|mein|me|m|sabki|sabka|all|everyone|employees|employee|department|engineering|sales|hr|finance|product|marketing|operations|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december|20\d{2})\b",
                " ",
                q,
            )
            cleaned_emp = re.sub(r"\b(ka|ki|ke|ko|se|ne|ho|to|or|and)\b", " ", cleaned_emp)
            cleaned_emp = " ".join(cleaned_emp.split()).strip(" ?.,!'\"s")
            emp_query = cleaned_emp if len(cleaned_emp) >= 3 else None

            data = self.toolbox.run_or_get_monthly_payroll(
                month=m_val,
                year=y_val,
                employee_name_query=emp_query,
                department_filter=dept_filter,
                create_if_missing=True,
            )

            if data.get("error"):
                lines = [f"**Payroll Notice for {data.get('month_label', '')}:** {data['error']}"]
                unassigned = data.get("unassigned_employees") or []
                if unassigned:
                    emp_names = ", ".join(
                        f"**{u['employee_name']}** ({u['department']})" for u in unassigned[:12]
                    )
                    lines.append(
                        f"- **Active Employees Missing Salary Structure ({data.get('unassigned_employees_count', len(unassigned))}):** {emp_names}"
                    )
                return {
                    "reply": "\n".join(lines),
                    "tools_used": ["run_or_get_monthly_payroll"],
                    "pending_actions": self.toolbox.pending_actions,
                    "role_mode": "admin",
                    "provider": "local-db-engine",
                    "mode": "deterministic_fallback",
                }

            s = data["summary"]
            action_tag = (
                "Newly Generated Draft"
                if data["action_taken"] == "created_new_draft_run"
                else f"Status: {str(data['payroll_status']).upper()}"
            )
            lines = [
                f"**Payroll Summary{dept_label} for {data['month_label']} ({action_tag}) — {s['payslip_count']} Payslip(s):**",
                f"- **Total Gross Earnings:** ₹{s['total_gross_earnings']:,.2f} | **Total Deductions:** ₹{s['total_deductions']:,.2f} | **Total Net Payout:** **₹{s['total_net_pay']:,.2f}**",
            ]

            emp_list = data.get("employee_salaries") or []
            if emp_query and len(emp_list) == 1:
                emp_item = emp_list[0]
                lines.append(
                    f"\n**Detailed Salary Breakdown for {emp_item['employee_name']} ({emp_item['department']} • `{emp_item['payslip_number']}`):**"
                )
                lines.append(
                    f"- **Working Days:** {emp_item['working_days']}d | **LOP Days:** {emp_item['lop_days']}d (LOP Deduction: ₹{emp_item['lop_amount']:,.2f})"
                )
                lines.append(
                    f"- **Basic Pay:** ₹{emp_item['basic_pay']:,.2f} | **Gross Pay:** ₹{emp_item['gross_earnings']:,.2f} | **Total Deductions:** ₹{emp_item['total_deductions']:,.2f} | **Net Take-Home Pay:** **₹{emp_item['net_pay']:,.2f}**"
                )
                if emp_item.get("earnings_breakdown"):
                    earn_txt = ", ".join(
                        f"{c['component']}: ₹{c['amount']:,.2f}" for c in emp_item["earnings_breakdown"]
                    )
                    lines.append(f"- **Earnings:** {earn_txt}")
                if emp_item.get("deductions_breakdown"):
                    ded_txt = ", ".join(
                        f"{c['component']}: ₹{c['amount']:,.2f}" for c in emp_item["deductions_breakdown"]
                    )
                    lines.append(f"- **Deductions:** {ded_txt}")
            elif emp_list:
                lines.append(f"\n**Employee-wise Salary Breakdown ({len(emp_list)}):**")
                for emp_item in emp_list[:35]:
                    lop_txt = (
                        f", LOP: {emp_item['lop_days']}d (-₹{emp_item['lop_amount']:,.2f})"
                        if emp_item["lop_days"] > 0
                        else ""
                    )
                    lines.append(
                        f"- **{emp_item['employee_name']}** ({emp_item['department']}) — "
                        f"Gross: ₹{emp_item['gross_earnings']:,.2f}, Deductions: ₹{emp_item['total_deductions']:,.2f}{lop_txt} • "
                        f"**Net Pay: ₹{emp_item['net_pay']:,.2f}**"
                    )
            else:
                lines.append(f"\nNo matching payslip records found for `\"{emp_query or 'this filter'}\"`.")

            skipped = data.get("unassigned_or_skipped_employees") or []
            if skipped:
                skipped_names = ", ".join(
                    f"**{sk['employee_name']}** ({sk['department']})" for sk in skipped[:10]
                )
                more_cnt = max(0, len(skipped) - 10)
                more_str = f" and {more_cnt} more" if more_cnt > 0 else ""
                lines.append(
                    f"\n- **Note (Missing Salary Structure — {s['unassigned_or_skipped_count']} Active Employee(s) Skipped):** {skipped_names}{more_str}"
                )

            if data.get("payroll_status") == "draft":
                lines.append(
                    "\nThis payroll run is currently in **DRAFT** status. Click **Finalize Payroll Run** on the card below to lock and publish all payslips."
                )

            return {
                "reply": "\n".join(lines),
                "tools_used": ["run_or_get_monthly_payroll"],
                "pending_actions": self.toolbox.pending_actions,
                "role_mode": "admin",
                "provider": "local-db-engine",
                "mode": "deterministic_fallback",
            }

        # 1. Explicit Leave Approve / Reject or Pending Approvals intent
        if any(w in q for w in ("pending", "approval", "queue", "approve", "reject")):
            # Check if a specific employee name was mentioned for approval (excluding relative date/time words)
            cleaned_emp = re.sub(
                r"\b(approve|reject|pending|leave|leaves|request|requests|approvals|what|are|show|all|the|for|of|in|on|ki|ka|ko|ke|se|mein|main|me|kar|do|kardo|please|chhutti|chutti|pichle|pichhle|last|past|previous|agle|next|din|dino|days|day|week|hafte|month|mahine|aaj|kal|today|yesterday|tomorrow|koi|kisi|aayi|aaya|aya|thi|tha|the|hai|hain|\d+)\b",
                " ",
                q,
            )
            cleaned_emp = " ".join(cleaned_emp.split()).strip(" ?.,!'\"s")

            if cleaned_emp and len(cleaned_emp) >= 2 and not date_window:
                intended = "rejected" if "reject" in q else "approved"
                prep = self.toolbox.prepare_leave_approval_action(
                    employee_name_query=cleaned_emp,
                    intended_decision=intended,
                )
                if prep["found_count"] > 0:
                    lines = [
                        f"Found **{prep['found_count']}** pending leave request(s) matching `\"{cleaned_emp}\"`. "
                        "Please click **Approve Leave** or **Reject** on the card below to confirm:"
                    ]
                    for item in prep["matching_requests"]:
                        lines.append(
                            f"- **{item['employee_name']}** ({item['department']}) — **{item['leave_type_name']}** "
                            f"from **{item['start_date']}** to **{item['end_date']}** ({item['days']} day(s))"
                        )
                    return {
                        "reply": "\n".join(lines),
                        "tools_used": ["prepare_leave_approval_action"],
                        "pending_actions": self.toolbox.pending_actions,
                        "role_mode": "admin",
                        "provider": "local-db-engine",
                        "mode": "deterministic_fallback",
                    }

            win_s = date_window[0].isoformat() if date_window else None
            win_e = date_window[1].isoformat() if date_window else None
            data = self.toolbox.get_pending_approvals(
                attach_action_cards=True,
                start_date=win_s,
                end_date=win_e,
            )
            l_cnt = data["pending_leave_requests_count"]
            r_cnt = data["pending_regularizations_count"]
            if date_window and l_cnt == 0:
                s_d, e_d = date_window
                range_lbl = (
                    s_d.strftime("%d %b %Y")
                    if s_d == e_d
                    else f"{s_d.strftime('%d %b %Y')} to {e_d.strftime('%d %b %Y')}"
                )
                return {
                    "reply": f"No pending leave requests{dept_label} were found for **{range_lbl}**.",
                    "tools_used": ["get_pending_approvals"],
                    "pending_actions": [],
                    "role_mode": "admin",
                    "provider": "local-db-engine",
                    "mode": "deterministic_fallback",
                }
            lines = [
                "Here is the current **Pending Approvals Summary**:",
                f"- **Pending Leave Requests:** {l_cnt}",
                f"- **Pending Attendance Regularizations:** {r_cnt}",
            ]
            if data["pending_leave_requests"]:
                lines.append("\n**Pending Leave Requests (Use the cards below to Approve or Reject):**")
                for lr in data["pending_leave_requests"][:10]:
                    lines.append(
                        f"- **{lr['employee_name']}** ({lr['department']}) — {lr['leave_type']} ({lr['start_date']} to {lr['end_date']}, {lr['days']} day(s))"
                    )
            if data["pending_regularizations"]:
                lines.append("\n**Pending Regularizations:**")
                for r in data["pending_regularizations"][:10]:
                    lines.append(f"- **{r['employee_name']}** — Date: {r['record_date']} ({r['reason'] or 'No reason specified'})")
            return {
                "reply": "\n".join(lines),
                "tools_used": ["get_pending_approvals"],
                "pending_actions": self.toolbox.pending_actions,
                "role_mode": "admin",
                "provider": "local-db-engine",
                "mode": "deterministic_fallback",
            }

        # 2. Late comers intent
        if any(w in q for w in ("late", "let ", "leit", "deri", "delayed", "punctual")):
            data = self.toolbox.get_late_comers(target_date=date_str, department_filter=dept_filter)
            cnt = data["late_count"]
            if cnt == 0:
                reply = (
                    f"For **{data['date_formatted']}**{dept_label}, there are **0 late comers** out of "
                    f"**{data['total_present']}** present employee(s)."
                )
            else:
                lines = [
                    f"On **{data['date_formatted']}**{dept_label}, **{cnt}** employee(s) clocked in late (out of {data['total_present']} present):"
                ]
                for emp in data["late_comers"]:
                    lines.append(
                        f"- **{emp['employee_name']}** ({emp['department']}) — Clocked in at **{emp['check_in']}** (late by **{emp['late_by_minutes']} mins**)"
                    )
                reply = "\n".join(lines)
            return {
                "reply": reply,
                "tools_used": ["get_late_comers"],
                "pending_actions": [],
                "role_mode": "admin",
                "provider": "local-db-engine",
                "mode": "deterministic_fallback",
            }

        # 3. Leave intent
        if any(w in q for w in ("leave", "on live", "chhutti", "chutti", "chuti", "vacation", "off today")):
            s_d, e_d = date_window if date_window else (target_date, target_date)
            data = self.toolbox.get_employees_on_leave(
                start_date=s_d.isoformat(),
                end_date=e_d.isoformat(),
                department_filter=dept_filter,
            )
            leaves = data["leaves"]
            range_lbl = (
                s_d.strftime("%d %b %Y")
                if s_d == e_d
                else f"{s_d.strftime('%d %b %Y')} to {e_d.strftime('%d %b %Y')}"
            )
            if not leaves:
                reply = f"No leave requests{dept_label} were found for **{range_lbl}**."
            else:
                lines = [
                    f"For **{range_lbl}**{dept_label}, there are **{data['approved_count']} approved** and **{data['pending_count']} pending** leave request(s):"
                ]
                for lr in leaves:
                    lines.append(
                        f"- **{lr['employee_name']}** ({lr['department']}) — **{lr['leave_type']}** [{lr['status'].upper()}] ({lr['start_date']} to {lr['end_date']}, {lr['days']} day(s))"
                    )
                reply = "\n".join(lines)
            return {
                "reply": reply,
                "tools_used": ["get_employees_on_leave"],
                "pending_actions": self.toolbox.pending_actions,
                "role_mode": "admin",
                "provider": "local-db-engine",
                "mode": "deterministic_fallback",
            }

        # 4. Attendance / Present / Absent / Summary intent
        is_overview_query = any(w in q for w in ("overview", "summary", "digest", "full attendance"))
        is_absent_query = ("absent" in q or "nahi aaya" in q or "nahi aaye" in q) and not is_overview_query
        is_present_query = any(
            w in q for w in ("present", "pleasant", "preset", "prasent", "aaya", "aaye", "aya", "in office", "clocked in")
        ) and not is_overview_query

        if is_overview_query or is_absent_query or is_present_query or "attendance" in q or dept_filter:
            if is_absent_query:
                status_filter = "absent"
            elif is_present_query:
                status_filter = "present"
            else:
                status_filter = "all"

            data = self.toolbox.get_daily_attendance(
                target_date=date_str,
                status_filter=status_filter,
                department_filter=dept_filter,
            )
            s = data["summary"]
            emps = data["employees"]

            if status_filter == "present":
                if not emps:
                    reply = f"No employees{dept_label} are marked **Present** on **{data['date_formatted']}** (out of {s['total_employees']} total)."
                else:
                    lines = [
                        f"On **{data['date_formatted']}**{dept_label}, **{s['present_count']} out of {s['total_employees']}** employee(s) are **Present**:"
                    ]
                    for e in emps[:30]:
                        out_str = f", Out: {e['check_out']}" if e["check_out"] else " (Currently in office)"
                        lines.append(f"- **{e['employee_name']}** ({e['department']}) — In: **{e['check_in']}**{out_str}")
                    reply = "\n".join(lines)
            elif status_filter == "absent":
                if not emps:
                    reply = f"No employees{dept_label} are **Absent** on **{data['date_formatted']}**!"
                else:
                    lines = [
                        f"On **{data['date_formatted']}**{dept_label}, **{s['absent_count']} out of {s['total_employees']}** employee(s) are **Absent**:"
                    ]
                    for e in emps[:30]:
                        lines.append(f"- **{e['employee_name']}** ({e['department']})")
                    reply = "\n".join(lines)
            else:
                lines = [
                    f"**Attendance Overview{dept_label} for {data['date_formatted']}:**",
                    f"- **Total Employees:** {s['total_employees']}",
                    f"- **Present:** {s['present_count']} ({s['currently_in_office_count']} currently clocked in)",
                    f"- **On Leave:** {s['on_leave_count']}",
                    f"- **Absent:** {s['absent_count']}",
                ]
                present_list = [e for e in emps if e["status"].startswith("Present")]
                leave_list = [e for e in emps if e["status"] == "On Leave"]
                if present_list:
                    lines.append(f"\n**Present ({len(present_list)}):**")
                    for e in present_list[:15]:
                        lines.append(f"- **{e['employee_name']}** ({e['department']}) — In: {e['check_in']}")
                if leave_list:
                    lines.append(f"\n**On Leave ({len(leave_list)}):**")
                    for e in leave_list[:10]:
                        lines.append(f"- **{e['employee_name']}** ({e['department']}) — {e['leave_type']}")
                reply = "\n".join(lines)

            return {
                "reply": reply,
                "tools_used": ["get_daily_attendance"],
                "pending_actions": [],
                "role_mode": "admin",
                "provider": "local-db-engine",
                "mode": "deterministic_fallback",
            }

        # 5. Fuzzy employee name search
        cleaned_name = re.sub(
            r"\b(who|is|where|what|tell|me|about|status|of|today|aaj|ka|ki|ke|details|batao|check|find|employee|aaya|hai|kya|in|the|department)\b",
            " ",
            q,
        )
        cleaned_name = " ".join(cleaned_name.split()).strip(" ?.,!") or user_message.strip()
        emp_data = self.toolbox.find_employee(cleaned_name)
        matches = emp_data.get("matches", [])
        if matches:
            lines = [f"Found **{len(matches)}** matching employee record(s) for `\"{cleaned_name}\"`:"]
            for m in matches[:3]:
                ci = f" (Check-in: {m['today_check_in']})" if m.get("today_check_in") else ""
                bals = ", ".join(f"{b['leave_type']}: {b['remaining_days']}d" for b in m.get("leave_balances", []))
                bal_str = f" | Leave Balance: {bals}" if bals else ""
                lines.append(
                    f"- **{m['employee_name']}** (`{m['employee_code']}`) — {m['designation']}, {m['department']} | "
                    f"**Today:** {m['today_status']}{ci}{bal_str}"
                )
            return {
                "reply": "\n".join(lines),
                "tools_used": ["find_employee"],
                "pending_actions": [],
                "role_mode": "admin",
                "provider": "local-db-engine",
                "mode": "deterministic_fallback",
            }

        data = self.toolbox.get_daily_attendance(target_date=date_str)
        s = data["summary"]
        return {
            "reply": (
                f"I couldn't find an employee matching `\"{cleaned_name}\"`, but here is **Today's Company Attendance Summary ({data['date_formatted']})**:\n"
                f"- **Total Employees:** {s['total_employees']}\n"
                f"- **Present:** {s['present_count']}\n"
                f"- **On Leave:** {s['on_leave_count']}\n"
                f"- **Absent:** {s['absent_count']}\n\n"
                "Try asking: *\"Who is present today in Engineering?\"*, *\"Who is on leave?\"*, *\"Show today's late comers\"*, or *\"Approve pending leaves\"*."
            ),
            "tools_used": ["find_employee", "get_daily_attendance"],
            "pending_actions": [],
            "role_mode": "admin",
            "provider": "local-db-engine",
            "mode": "deterministic_fallback",
        }
