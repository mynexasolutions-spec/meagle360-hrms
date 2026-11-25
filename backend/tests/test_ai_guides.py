"""How-to guides: matching, permissions, routing, and links that still exist."""

import re
from pathlib import Path

import pytest

from app.services.ai import guide_service as gs
from app.services.ai.agent_service import AIAgentService
from app.services.ai.guides import GUIDES, GUIDES_BY_ID
from app.services.ai.llm_client import LLMProviderError

ADMIN = gs.UserAccess(permissions={}, is_admin=True)
EMPLOYEE = gs.UserAccess(permissions={"expenses:write": True}, is_admin=False)


def top(message, page=None, previous=None):
    found = gs.find_for_message(message, page, previous)
    return found[0].id if found else None


@pytest.mark.parametrize("message, guide_id", [
    ("offer letter kaise banta hai", "offer-letter"),
    ("ofer leter kaise bnega", "offer-letter"),
    ("How do I create an offer letter?", "offer-letter"),
    ("Rahul ka offer letter bana do", "offer-letter"),
    ("offer letter", "offer-letter"),
    ("releving letter kaise banta hai", "relieving-letter"),
    ("experience letter chahiye", "relieving-letter"),
    ("Rahul company chhod raha hai uska letter kaise nikalu", "relieving-letter"),
    ("naya employee kaise add kare", "invite-employee"),
    ("leave kaise apply karu", "apply-leave"),
    ("chutti kaise apply kare", "apply-leave"),
    ("leave approve kaise karte hai", "approve-leave"),
    ("how to run payroll", "run-payroll"),
    ("payroll kaise banaye", "run-payroll"),
    ("payslip kaise download kare", "view-payslip"),
    ("expense kaise submit kare", "submit-expense"),
    ("how to post a job opening", "create-job"),
    ("shift kaise assign kare", "shifts"),
    ("punch karna bhool gaya kya karna hoga", "regularization"),
    ("ticket kaise raise kare", "helpdesk"),
    ("holiday kaise add kare", "company-setup"),
])
def test_finds_the_right_guide(message, guide_id):
    assert top(message) == guide_id


@pytest.mark.parametrize("message", [
    "Who is present today?", "aaj kaun late aaya", "How is my attendance this month?", "meri attendance kaise hai",
    "What is my leave balance?", "kal ki leave apply kar do", "Apply sick leave for tomorrow",
    "I want to apply for leave tomorrow", "mujhe kal chhutti chahiye", "Approve Rahul's leave",
    "payroll bana do", "is mahine ka payroll bana do", "Meri is mahine ki salary kitni bani hai?", "show my payslip",
    "What leave approvals are pending?", "What is the status of my applied leaves?", "Emily ki leave approve kar do",
    "How many employees are on leave?", "list all employees", "hello", "Who is present today in the HR department?",
    "show payroll breakdown for October", "late comers",
])
def test_data_and_actions_are_left_to_the_normal_flow(message):
    assert top(message) is None
    # Also right after a guide, whenever the message names a topic the AI has a tool for.
    if gs.search(message):
        assert top(message, previous="offer-letter") is None


def test_page_and_follow_up():
    assert top("yeh kaise karu", page="/relieving-letter") == "relieving-letter"
    assert top("yeh kaise karu") is None
    assert top("aur agar address galat ho to?", previous="offer-letter") == "offer-letter"
    assert top("aaj kaun late aaya", previous="offer-letter") is None


def test_permissions():
    assert ADMIN.allows(GUIDES_BY_ID["relieving-letter"])
    assert not EMPLOYEE.allows(GUIDES_BY_ID["relieving-letter"])
    assert EMPLOYEE.allows(GUIDES_BY_ID["submit-expense"])
    assert "relieving-letter" not in {g.id for g in gs.guides_for(EMPLOYEE)}
    assert "error" in gs.search_guide("relieving letter", EMPLOYEE)
    assert "guides" in gs.search_guide("relieving letter", ADMIN)


def test_guide_paths_exist_in_the_frontend():
    app = (Path(__file__).parents[2] / "frontend" / "src" / "App.jsx").read_text(encoding="utf-8")
    routes = {"/" + p.strip("/") for p in re.findall(r'path="([^"]+)"', app)}
    assert len(GUIDES_BY_ID) == len(GUIDES)
    for guide in GUIDES:
        assert guide.path.split("?")[0] in routes, guide.id


class FakeLLM:
    provider, is_configured, guide_model = "groq", True, "small"

    def __init__(self, reply):
        self.reply, self.calls = reply, []

    def chat(self, messages, tools=None, model=None, **_):
        self.calls.append((messages, tools, model))
        if isinstance(self.reply, Exception):
            raise self.reply
        return {"content": self.reply}


def agent(reply, access=ADMIN):
    a = AIAgentService.__new__(AIAgentService)
    a.access, a.role_mode, a.llm = access, "admin", FakeLLM(reply)
    return a


def ask(a, message="relieving letter kaise banta hai"):
    return a._answer_from_guides(message, [], None, None)


def test_model_gets_only_the_guide_and_no_tools():
    a = agent("GUIDE: relieving-letter\n1. Open it")
    result = ask(a)
    messages, tools, model = a.llm.calls[0]
    assert (result["reply"], result["mode"]) == ("1. Open it", "guide")
    assert result["guide"]["path"] == "/relieving-letter"
    assert tools is None and model == "small"
    assert len(messages[0]["content"]) < 6000


def test_failure_shows_the_saved_guide():
    result = ask(agent(LLMProviderError("down")))
    assert result["mode"] == "guide_local" and "Last Working Date" in result["reply"]


def test_topic_change_goes_to_the_normal_flow():
    a = agent("NOT_GUIDE")
    assert a._answer_from_guides("Rahul aaj office aaya hai?", [], None, "offer-letter") is None


def test_no_permission_uses_no_tokens():
    a = agent("x", EMPLOYEE)
    result = ask(a)
    assert result["mode"] == "guide_local" and result["guide"] is None and not a.llm.calls


def test_reply_language():
    assert "Hinglish" in gs.reply_language("offer letter kaise banta hai")
    assert "English." in gs.reply_language("How do I upload the signature?")
