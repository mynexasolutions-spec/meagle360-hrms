"""AI Agent Service — orchestrates tool calling + local deterministic fallback."""

from __future__ import annotations

import json
import logging
import re
from datetime import timedelta
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.services.ai.llm_client import LLMClient, LLMProviderError
from app.services.ai.tools import AIToolbox, TOOL_SCHEMAS, get_ist_now, get_ist_today

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 3


def build_system_prompt() -> str:
    now_ist = get_ist_now()
    today_str = now_ist.strftime("%Y-%m-%d (%A)")
    time_str = now_ist.strftime("%I:%M %p IST")
    yesterday_str = (now_ist.date() - timedelta(days=1)).isoformat()
    tomorrow_str = (now_ist.date() + timedelta(days=1)).isoformat()

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
        "3. ACCURACY: Never guess or fabricate employee names, counts, times, or dates. Every number, "
        "name, and timestamp in your answer MUST come strictly from the tool output.\n"
        "4. PINPOINT FILTERING: If the user asks about a specific department (e.g. 'in Engineering') or "
        "a specific status ('who is present', 'who is absent', 'who is late'), pass `department_filter` "
        "and/or `status_filter` to the tool and ONLY answer what was asked — do not dump the full company overview unless asked for an overview.\n"
        "5. OFF-TOPIC: Only if a question is 100% clearly unrelated to workplace/HR/employees (e.g. coding, "
        "sports, politics, recipes, general trivia), politely say you are Meagle 360 AI and can "
        "help with attendance, leaves, late comers, approvals, and employee info. When in doubt, call `find_employee` or `get_daily_attendance`.\n"
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
        # Skip Markdown horizontal rules (---, ***, ___) or table separator rows (|---|---|)
        if re.match(r"^[\|\s:\-_]{3,}$", stripped):
            continue
        # Convert Markdown table row | A | B | C | into clean bullet line
        if stripped.startswith("|") and stripped.endswith("|"):
            cells = [c.strip() for c in stripped.strip("|").split("|") if c.strip()]
            if not cells:
                continue
            # Skip table header row like | Employee | Department | Check-in |
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
    """Runs the function-calling agent loop scoped to the authenticated tenant."""

    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id
        self.toolbox = AIToolbox(db, company_id)
        self.llm = LLMClient()

    def chat(
        self,
        user_message: str,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        clean_msg = (user_message or "").strip()
        if not clean_msg:
            return {
                "reply": "Please ask a question about attendance, leaves, late comers, or an employee.",
                "tools_used": [],
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
        return self._run_deterministic_fallback(clean_msg)

    def _run_llm_agent_loop(
        self,
        user_message: str,
        history: list[dict[str, str]],
        tools_used: list[str],
    ) -> dict[str, Any]:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": build_system_prompt()}
        ]

        for turn in history[-6:]:
            role = turn.get("role")
            content = turn.get("content")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": str(content)[:1500]})

        messages.append({"role": "user", "content": user_message})

        for _ in range(MAX_TOOL_ITERATIONS):
            assistant_msg = self.llm.chat(messages=messages, tools=TOOL_SCHEMAS)
            tool_calls = assistant_msg.get("tool_calls")

            if not tool_calls:
                reply_text = _sanitize_reply((assistant_msg.get("content") or "").strip())
                if not reply_text:
                    reply_text = "I checked your HRMS records, but couldn't generate a response."
                return {
                    "reply": reply_text,
                    "tools_used": tools_used,
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

        # Final synthesis call without tools after max tool turns
        final_msg = self.llm.chat(messages=messages, tools=None)
        return {
            "reply": _sanitize_reply((final_msg.get("content") or "").strip()),
            "tools_used": tools_used,
            "provider": self.llm.provider,
            "mode": "llm",
        }

    # ── Smart Deterministic Fallback (Always Accurate from Live DB) ───────
    def _run_deterministic_fallback(self, user_message: str) -> dict[str, Any]:
        """Executes the exact same read-only tools with department + status filters
        and formats a pinpoint English answer directly from PostgreSQL data."""
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

        # 1. Pending approvals intent
        if any(w in q for w in ("pending", "approval", "queue", "approve")):
            data = self.toolbox.get_pending_approvals()
            l_cnt = data["pending_leave_requests_count"]
            r_cnt = data["pending_regularizations_count"]
            lines = [
                f"Here is the current **Pending Approvals Summary**:",
                f"- **Pending Leave Requests:** {l_cnt}",
                f"- **Pending Attendance Regularizations:** {r_cnt}",
            ]
            if data["pending_leave_requests"]:
                lines.append("\n**Pending Leave Requests:**")
                for lr in data["pending_leave_requests"][:10]:
                    lines.append(
                        f"- **{lr['employee_name']}** — {lr['leave_type']} ({lr['start_date']} to {lr['end_date']}, {lr['days']} day(s))"
                    )
            if data["pending_regularizations"]:
                lines.append("\n**Pending Regularizations:**")
                for r in data["pending_regularizations"][:10]:
                    lines.append(f"- **{r['employee_name']}** — Date: {r['record_date']} ({r['reason'] or 'No reason specified'})")
            return {
                "reply": "\n".join(lines),
                "tools_used": ["get_pending_approvals"],
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

            # Focused Present Answer (no noisy full overview!)
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

            # Focused Absent Answer
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

            # Full Overview (only when explicitly requested or general department query)
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
                "provider": "local-db-engine",
                "mode": "deterministic_fallback",
            }

        # 5. Otherwise try fuzzy employee name search
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
                "provider": "local-db-engine",
                "mode": "deterministic_fallback",
            }

        # Default fallback: show today's daily attendance summary
        data = self.toolbox.get_daily_attendance(target_date=date_str)
        s = data["summary"]
        return {
            "reply": (
                f"I couldn't find an employee matching `\"{cleaned_name}\"`, but here is **Today's Company Attendance Summary ({data['date_formatted']})**:\n"
                f"- **Total Employees:** {s['total_employees']}\n"
                f"- **Present:** {s['present_count']}\n"
                f"- **On Leave:** {s['on_leave_count']}\n"
                f"- **Absent:** {s['absent_count']}\n\n"
                "Try asking: *\"Who is present today in Engineering?\"*, *\"Who is on leave?\"*, *\"Show today's late comers\"*, or *\"Pending approvals\"*."
            ),
            "tools_used": ["find_employee", "get_daily_attendance"],
            "provider": "local-db-engine",
            "mode": "deterministic_fallback",
        }
