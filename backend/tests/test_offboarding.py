"""Employee offboarding: notice period, exit, cancel, auto-exit, login block."""

import uuid
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services import offboarding_service as ob
from app.services.offboarding_service import OffboardingError, OffboardingService

TODAY = date(2026, 11, 27)
COMPANY = uuid.uuid4()


def _emp(**kw):
    base = dict(id=uuid.uuid4(), company_id=COMPANY, full_name="Rahul Sharma", date_of_hire=date(2022, 1, 10),
                employment_status="active", offboarding_status=None, exit_type=None, resignation_date=None,
                last_working_date=None, date_of_exit=None, exit_reason=None, offboarding_started_at=None)
    base.update(kw)
    return SimpleNamespace(**base)


@pytest.fixture
def svc():
    """Service with DB lookups stubbed; summary() just echoes the state."""
    db = MagicMock()
    service = OffboardingService(db, COMPANY)
    with patch.object(ob, "today_ist", return_value=TODAY), \
         patch.object(ob, "log_action") as log, \
         patch.object(OffboardingService, "summary", lambda self, i: "summary"):
        service.log = log
        yield service


def _with(svc, emp, fnf_count=0):
    svc._employee = lambda _id: emp
    svc.db.query.return_value.filter.return_value.count.return_value = fnf_count
    return emp


def test_future_last_day_starts_notice_and_keeps_employee_active(svc):
    emp = _with(svc, _emp())
    svc.start(emp.id, {"exit_type": "resignation", "last_working_date": TODAY + timedelta(days=30),
                       "resignation_date": TODAY, "exit_reason": "  Higher studies "}, uuid.uuid4())
    assert emp.offboarding_status == "notice"
    assert emp.employment_status == "active"  # payroll / login keep working during notice
    assert emp.exit_reason == "Higher studies"
    assert emp.offboarding_started_at is not None
    svc.db.commit.assert_called_once()


def test_last_day_today_still_serves_notice(svc):
    emp = _with(svc, _emp())
    svc.start(emp.id, {"exit_type": "resignation", "last_working_date": TODAY}, uuid.uuid4())
    assert emp.offboarding_status == "notice" and emp.employment_status == "active"


def test_past_last_day_exits_at_once(svc):
    emp = _with(svc, _emp())
    lwd = TODAY - timedelta(days=3)
    svc.start(emp.id, {"exit_type": "termination", "last_working_date": lwd}, uuid.uuid4())
    assert emp.offboarding_status == "exited"
    assert emp.employment_status == "inactive"
    assert emp.date_of_exit == lwd


def test_updating_notice_keeps_original_start_time(svc):
    started = object()
    emp = _with(svc, _emp(offboarding_status="notice", offboarding_started_at=started,
                          last_working_date=TODAY + timedelta(days=30)))
    svc.start(emp.id, {"exit_type": "resignation", "last_working_date": TODAY + timedelta(days=10)}, uuid.uuid4())
    assert emp.last_working_date == TODAY + timedelta(days=10)
    assert emp.offboarding_started_at is started


@pytest.mark.parametrize("emp_kw, data, msg", [
    ({"employment_status": "inactive", "offboarding_status": "exited"},
     {"exit_type": "resignation", "last_working_date": TODAY}, "already exited"),
    ({}, {"exit_type": "resignation", "last_working_date": TODAY, "resignation_date": TODAY + timedelta(days=1)},
     "Resignation date"),
    ({}, {"exit_type": "resignation", "last_working_date": date(2021, 1, 1)}, "date of joining"),
    ({}, {"exit_type": "fired", "last_working_date": TODAY}, "Unknown exit type"),
])
def test_start_rejects_invalid_requests(svc, emp_kw, data, msg):
    emp = _with(svc, _emp(**emp_kw))
    with pytest.raises(OffboardingError, match=msg):
        svc.start(emp.id, data, uuid.uuid4())


def test_cannot_offboard_yourself(svc):
    emp = _with(svc, _emp())
    with pytest.raises(OffboardingError, match="yourself"):
        svc.start(emp.id, {"exit_type": "resignation", "last_working_date": TODAY}, emp.id)


def test_exit_now_moves_future_last_day_to_today(svc):
    emp = _with(svc, _emp(offboarding_status="notice", last_working_date=TODAY + timedelta(days=20)))
    svc.exit_now(emp.id, uuid.uuid4())
    assert emp.employment_status == "inactive" and emp.offboarding_status == "exited"
    assert emp.date_of_exit == TODAY


def test_exit_now_needs_offboarding_started(svc):
    emp = _with(svc, _emp())
    with pytest.raises(OffboardingError):
        svc.exit_now(emp.id, uuid.uuid4())


def test_cancel_restores_active_employee(svc):
    emp = _with(svc, _emp(employment_status="inactive", offboarding_status="exited", exit_type="resignation",
                          last_working_date=TODAY, date_of_exit=TODAY, exit_reason="x"))
    svc.cancel(emp.id, uuid.uuid4())
    assert emp.employment_status == "active"
    assert emp.offboarding_status is None and emp.date_of_exit is None and emp.last_working_date is None


def test_cancel_blocked_when_fnf_exists(svc):
    emp = _with(svc, _emp(offboarding_status="notice"), fnf_count=1)
    with pytest.raises(OffboardingError, match="full & final"):
        svc.cancel(emp.id, uuid.uuid4())
    assert emp.offboarding_status == "notice"


def test_apply_due_exits_people_after_their_last_day():
    due = [_emp(offboarding_status="notice", last_working_date=TODAY - timedelta(days=1))]
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = due
    with patch.object(ob, "log_action"):
        assert ob.apply_due(db, today=TODAY) == 1
    assert due[0].employment_status == "inactive" and due[0].date_of_exit == TODAY - timedelta(days=1)
    db.commit.assert_called_once()


def test_inactive_employee_token_is_rejected():
    from app import dependencies
    user = SimpleNamespace(id=uuid.uuid4(), employee=SimpleNamespace(employment_status="inactive"))
    with patch.object(dependencies, "decode_token", return_value={"type": "tenant", "sub": str(user.id)}), \
         patch.object(dependencies.UserAccountRepository, "get_by_id_global", return_value=user):
        with pytest.raises(HTTPException) as exc:
            dependencies.get_current_user(token="t", db=MagicMock())
    assert exc.value.status_code == 401
    assert "deactivated" in exc.value.detail


def test_active_employee_token_still_works():
    from app import dependencies
    user = SimpleNamespace(id=uuid.uuid4(), employee=SimpleNamespace(employment_status="active"))
    with patch.object(dependencies, "decode_token", return_value={"type": "tenant", "sub": str(user.id)}), \
         patch.object(dependencies.UserAccountRepository, "get_by_id_global", return_value=user):
        assert dependencies.get_current_user(token="t", db=MagicMock()) is user


def test_employee_lookup_is_tenant_scoped():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    with pytest.raises(LookupError):
        OffboardingService(db, COMPANY)._employee(uuid.uuid4())
    # the filter includes company_id
    args = db.query.return_value.filter.call_args[0]
    assert any("company_id" in str(a) for a in args)
