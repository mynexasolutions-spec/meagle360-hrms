"""Who can read another employee's profile, private details and documents."""

import uuid
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database import get_db
from app.dependencies import get_company_id, get_current_user
from app.routes import dashboard, employee, employee_document
from app.services.team_service import TeamService

EMP = uuid.uuid4()
COMPANY = uuid.uuid4()
NOW = datetime(2026, 1, 1)
RECORD = dict(
    id=EMP, company_id=COMPANY, department_id=None, manager_id=None, site_id=None,
    full_name="Asha", employee_code="E1", date_of_hire=date(2025, 1, 1),
    employment_status="active", photo_url=None, personal_email="a@x.com", phone="99",
    date_of_birth=date(1990, 1, 1), gender="f", address="home",
    emergency_contact_name="B", emergency_contact_phone="98", employment_type="full_time",
    pan_number="PAN", bank_account_number="123", declared_investments=500,
    created_at=NOW, updated_at=NOW,
)


def _client(perms, own_id=None):
    app = FastAPI()
    app.include_router(employee.router)
    app.include_router(employee_document.router)
    app.include_router(dashboard.router)
    user = SimpleNamespace(employee_id=own_id or uuid.uuid4(), merged_permissions={p: True for p in perms})
    app.dependency_overrides = {
        get_db: lambda: MagicMock(), get_company_id: lambda: COMPANY, get_current_user: lambda: user,
    }
    return TestClient(app)


@pytest.fixture(autouse=True)
def service():
    with patch.object(employee, "EmployeeService") as cls:
        svc = cls.return_value
        svc.get_employee.return_value = SimpleNamespace(documents=[])
        svc.to_profile_dict.return_value = dict(RECORD)
        svc.list_employees.return_value = [SimpleNamespace(**RECORD)]
        yield svc


def test_approver_sees_work_profile_only():
    body = _client(["leave:approve"]).get(f"/api/employees/{EMP}").json()
    assert body["full_name"] == "Asha"
    assert body["pan_number"] is body["bank_account_number"] is body["phone"] is None
    assert float(body["declared_investments"]) == 0


@pytest.mark.parametrize("perm", ["employees:write", "settings:write", "payroll:read"])
def test_hr_and_payroll_see_private_details(perm):
    assert _client([perm]).get(f"/api/employees/{EMP}").json()["pan_number"] == "PAN"


def test_self_needs_no_permission():
    client = _client([], own_id=EMP)
    assert client.get(f"/api/employees/{EMP}").json()["pan_number"] == "PAN"
    assert client.get(f"/api/employees/{EMP}/documents").status_code == 200


@pytest.mark.parametrize("path", [f"/api/employees/{EMP}", "/api/employees/", "/api/employees/directory", "/api/employees/org-chart"])
def test_plain_employee_has_no_directory(path):
    assert _client(["employees:read", "leave:write"]).get(path).status_code == 403


@pytest.mark.parametrize("path", ["attendance-overview", "leave-summary", "leave-insight"])
def test_plain_employee_has_no_company_stats(path):
    assert _client(["employees:read"]).get(f"/api/dashboard/{path}").status_code == 403


def test_team_routes_open_to_everyone():
    with patch.object(employee, "TeamService") as cls:
        cls.return_value.get_team.return_value = {"manager": None, "peers": [], "reports": []}
        cls.return_value.find_colleagues.return_value = []
        client = _client([])
        assert client.get("/api/employees/my-team").status_code == 200
        assert client.get("/api/employees/colleagues?q=as").status_code == 200
        assert client.get("/api/employees/colleagues?q=a").status_code == 422


def test_team_status_prefers_leave_and_hides_its_type():
    me, boss = SimpleNamespace(id=EMP), uuid.uuid4()
    person = SimpleNamespace(
        id=boss, full_name="Boss", photo_url=None, designation=None, department=None, user_account=None,
    )
    svc = TeamService(MagicMock(), COMPANY)
    svc.is_day_off = lambda _: False
    svc.members = lambda _: {"manager": person, "peers": [], "reports": []}
    svc.db.query.return_value.filter.side_effect = [[(boss,)], [(boss,)]]  # present and on leave
    manager = svc.get_team(me.id)["manager"]
    assert manager["status"] == "on_leave"
    assert not any("leave_type" in k for k in manager)


@pytest.mark.parametrize("day_off,expected", [(False, "not_in"), (True, None)])
def test_no_status_on_a_day_off(day_off, expected):
    person = SimpleNamespace(
        id=EMP, full_name="A", photo_url=None, designation=None, department=None, user_account=None,
    )
    svc = TeamService(MagicMock(), COMPANY)
    svc.members = lambda _: {"manager": None, "peers": [person], "reports": []}
    svc.is_day_off = lambda _: day_off
    svc._status_today = lambda _: {}
    assert svc.get_team(uuid.uuid4())["peers"][0]["status"] == expected


@pytest.mark.parametrize("day,holiday,expected", [
    (date(2026, 11, 25), None, False), (date(2026, 11, 25), (1,), True), (date(2026, 11, 29), None, True),
])
def test_day_off(day, holiday, expected):
    svc = TeamService(MagicMock(), COMPANY)
    svc.db.query.return_value.filter.return_value.first.side_effect = [
        SimpleNamespace(weekly_off_days=[6]), holiday,
    ]
    assert svc.is_day_off(day) is expected


def test_list_is_redacted_for_approvers():
    assert _client(["leave:approve"]).get("/api/employees/").json()[0]["pan_number"] is None
    assert _client(["employees:write"]).get("/api/employees/").json()[0]["pan_number"] == "PAN"


def test_documents_closed_to_colleagues():
    assert _client(["employees:read"]).get(f"/api/employees/{EMP}/documents").status_code == 403
    assert _client(["employees:write"]).get(f"/api/employees/{EMP}/documents").status_code == 200


@pytest.mark.parametrize("perms,attendance,approvals", [
    ([], False, False), (["attendance:approve"], True, False), (["leave:approve"], False, True),
])
def test_dashboard_company_counts_follow_permissions(perms, attendance, approvals):
    with patch.object(dashboard, "DashboardService") as cls:
        cls.return_value.get_summary.return_value = {}
        _client(perms).get("/api/dashboard/summary")
        kwargs = cls.return_value.get_summary.call_args.kwargs
    assert (kwargs["show_attendance"], kwargs["show_approvals"]) == (attendance, approvals)
