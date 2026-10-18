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
    get_ist_now,
    get_ist_today,
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
            "1. LANGUAGE: Always reply in clear, concise, friendly English, regardless of whether "
            "the employee asks in English, Hindi, or Hinglish.\n"
            "2. PERSONAL SCOPE ONLY: You can ONLY access this logged-in employee's own data:\n"
            "   - Their own Leave Balance & Leave Request status (`get_my_leave_summary`)\n"
            "   - Their own Personal Attendance record & check-in/out times (`get_my_attendance_summary`)\n"
            "   - Preparing a Leave Application for them (`prepare_my_leave_application`)\n"
            "3. PRIVACY GUARDRAIL: If the employee asks about company-wide attendance, another employee's "
            "attendance, or who is present/late in a department, politely tell them that company/team "
            "attendance is restricted to Organization Admins and Managers, and offer to check their own "
            "attendance, leave balance, or help them apply for leave.\n"
            "4. APPLYING FOR LEAVE: Whenever the employee says they want to apply for leave, take a day off, "
            "or book chhutti (e.g. 'apply sick leave tomorrow', 'mujhe kal chhutti chahiye', 'apply casual leave "
            "from 20 Oct to 22 Oct'), ALWAYS call `prepare_my_leave_application` so an interactive "
            "'Confirm & Apply Leave' button card appears below your reply.\n"
            "5. FORMATTING: Never output Markdown tables (`|---|`) or horizontal divider lines (`---`). "
            "Use clean bullet points (`- **Label:** Value`) so replies look great and read smoothly aloud."
        )

    return (
        "You are Meagle 360 AI for Organization Admins and HR Managers.\n"
        f"- Current IST Date: {today_str}\n"
        f"- Current IST Time: {time_str}\n"
        f"- Yesterday: {yesterday_str} | Tomorrow: {tomorrow_str}\n\n"
        "STRICT RULES:\n"
        "1. LANGUAGE: Always reply in clear, concise, professional English, regardless of whether "
        "the user asks in English, Hindi, or Hinglish.\n"
        "2. VOICE & TYPO TOLERANCE: User queries often come from speech-to-text (Whisper/Mic) and may "
        "contain phonetic typos or Hinglish (e.g. 'pleasant'/'preset'/'prasent' -> 'present', "
        "'engine ring' -> 'Engineering', 'let'/'leit' -> 'late', 'chuti'/'live' -> 'leave', "
        "or misspelled Indian names like 'Rahu'/'Sidhart'). Always interpret imperfect transcripts "
        "generously as HR/attendance/leave/employee queries and call the matching tool.\n"
        "3. LEAVE APPROVALS: When the Admin/Manager asks to approve or reject a leave (e.g. "
        "'Approve Rahul's leave', 'Emily ki leave approve kar do', 'Reject pending leave') or asks "
        "what leave approvals are pending, call `prepare_leave_approval_action` or `get_pending_approvals`. "
        "This attaches interactive 'Approve Leave' / 'Reject' action buttons below your message. Tell the "
        "Admin to click the button below to confirm.\n"
        "4. ACCURACY: Never guess or fabricate employee names, counts, times, or dates. Every number, "
        "name, and timestamp in your answer MUST come strictly from the tool output.\n"
        "5. PINPOINT FILTERING: If the user asks about a specific department (e.g. 'in Engineering') or "
        "a specific status ('who is present', 'who is absent', 'who is late'), pass `department_filter` "
        "and/or `status_filter` to the tool and ONLY answer what was asked — do not dump the full company overview unless asked for an overview.\n"
        "6. FORMATTING (NO TABLES, NO DASH LINES): NEVER output Markdown tables (`|---|`), pipe characters (`|`), "
        "or horizontal divider lines (`---`). Always start your answer with a 1-line summary header that includes the "
        "exact Date (`date_formatted` from the tool output) and the Total Count, followed by clean bullet points:\n"
        "   **Absent Employees on 17 Oct 2026 (Saturday) — 19 Total:**\n"
        "   - **Employee Name** (Department) — Status / Time details\n"
        "   Keep answers concise and natural so they look clean on screen and sound smooth when spoken aloud."
    )


def _sanitize_reply(text: str) -> str:
    """Convert any residual Markdown table rows into clean bullet lines and remove '---' dividers."""
    if not text:
        return ""
    out_lines: list[str] = []
    lines = text.splitlines()
    for line in lines:
        stripped = line.strip()
        if re.match(r"^[\|\s:\-_]{3,}$", stripped):
            continue
        if stripped.startswith("|") and stripped.endswith("|"):
            cells = [c.strip() for c in stripped.strip("|").split("|") if c.strip()]
            if not cells:
                continue
            lower_cells = [re.sub(r"\*+", "", c).strip().lower() for c in cells]
            if any(h in lower_cells for h in ("employee", "employee name", "name")) and any(
                h in lower_cells for h in ("department", "status", "check-in", "check in", "late by", "leave type")
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

        # Guardrail if employee asks about company/department attendance or other employees
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
            )
        ):
            return {
                "reply": (
                    "Company-wide and department attendance records are restricted to **Organization Admins and Managers**.\n\n"
                    "As an Employee, I can help you with:\n"
                    "- **Your Leave Balance:** *\"What is my leave balance?\"*\n"
                    "- **Your Attendance:** *\"How is my attendance this month?\"*\n"
                    "- **Apply for Leave:** *\"Apply sick leave for tomorrow\"* or *\"Apply casual leave from 20 Oct to 22 Oct\"*\n"
                    "- **Leave Status:** *\"What is the status of my applied leaves?\"*"
                ),
                "tools_used": [],
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
        today = get_ist_today()

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

        # 1. Explicit Leave Approve / Reject or Pending Approvals intent
        if any(w in q for w in ("pending", "approval", "queue", "approve", "reject")):
            # Check if a specific employee name was mentioned for approval
            cleaned_emp = re.sub(
                r"\b(approve|reject|pending|leave|leaves|request|requests|approvals|what|are|show|all|the|for|of|ki|ka|ko|kar|do|kardo|please|chhutti|chutti)\b",
                " ",
                q,
            )
            cleaned_emp = " ".join(cleaned_emp.split()).strip(" ?.,!'\"s")

            if cleaned_emp and len(cleaned_emp) >= 2:
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

            data = self.toolbox.get_pending_approvals(attach_action_cards=True)
            l_cnt = data["pending_leave_requests_count"]
            r_cnt = data["pending_regularizations_count"]
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
            data = self.toolbox.get_employees_on_leave(
                start_date=date_str,
                end_date=date_str,
                department_filter=dept_filter,
            )
            leaves = data["leaves"]
            if not leaves:
                reply = f"No employees{dept_label} are on approved or pending leave for **{target_date.strftime('%d %b %Y')}**."
            else:
                lines = [
                    f"For **{target_date.strftime('%d %b %Y')}**{dept_label}, there are **{data['approved_count']} approved** and **{data['pending_count']} pending** leave request(s):"
                ]
                for lr in leaves:
                    lines.append(
                        f"- **{lr['employee_name']}** ({lr['department']}) — **{lr['leave_type']}** [{lr['status'].upper()}] ({lr['start_date']} to {lr['end_date']})"
                    )
                reply = "\n".join(lines)
            return {
                "reply": reply,
                "tools_used": ["get_employees_on_leave"],
                "pending_actions": [],
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
