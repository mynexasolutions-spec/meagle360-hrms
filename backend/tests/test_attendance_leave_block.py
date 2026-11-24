"""Unit tests for blocking clock-in / regularization on approved leave days
and suppressing stale attendance in daily overview."""

import uuid
from datetime import datetime, timezone, date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import pytest

from app.services.attendance_service import AttendanceService, _local_date


def _make_leave(employee_id, status="approved", leave_type_name="Personal Leave"):
    return SimpleNamespace(
        employee_id=employee_id,
        status=status,
        leave_type=SimpleNamespace(name=leave_type_name),
    )


def test_clock_in_blocked_when_on_approved_leave():
    db = MagicMock()
    company_id = uuid.uuid4()
    employee_id = uuid.uuid4()

    svc = AttendanceService(db, company_id)
    svc.repo.get_open_record = MagicMock(return_value=None)
    svc._get_approved_leave_on_date = MagicMock(
        return_value=_make_leave(employee_id, status="approved", leave_type_name="Personal Leave")
    )

    with pytest.raises(ValueError, match="cannot clock in today.*approved Personal Leave"):
        svc.clock_in(employee_id=employee_id)

    db.add.assert_not_called()
    db.commit.assert_not_called()


def test_clock_in_allowed_when_leave_is_only_pending():
    db = MagicMock()
    company_id = uuid.uuid4()
    employee_id = uuid.uuid4()

    svc = AttendanceService(db, company_id)
    svc.repo.get_open_record = MagicMock(return_value=None)
    svc.repo.get_last_closed_record = MagicMock(return_value=None)

    pending_leave = _make_leave(employee_id, status="pending", leave_type_name="Personal Leave")

    with patch("app.repositories.leave_repo.LeaveRequestRepository") as mock_lr_cls, \
         patch("app.services.geofence_service.GeofenceService") as mock_geo_cls, \
         patch("app.services.face_service.FaceService") as mock_face_cls:
        mock_lr_cls.return_value.get_by_employee_and_date_range.return_value = [pending_leave]
        mock_geo_cls.return_value.evaluate_clock_in.return_value = None
        mock_face_cls.return_value.evaluate_clock_in.return_value = None

        record = svc.clock_in(employee_id=employee_id)
        assert record.employee_id == employee_id
        db.add.assert_called_once()
        db.commit.assert_called_once()


def test_get_status_reports_approved_leave():
    db = MagicMock()
    company_id = uuid.uuid4()
    employee_id = uuid.uuid4()

    svc = AttendanceService(db, company_id)
    svc.repo.get_open_record = MagicMock(return_value=None)
    svc._get_approved_leave_on_date = MagicMock(
        return_value=_make_leave(employee_id, status="approved", leave_type_name="Sick Leave")
    )

    status = svc.get_status(employee_id)
    assert status == {
        "clocked_in": False,
        "clock_in": None,
        "on_leave_today": True,
        "leave_type": "Sick Leave",
    }


def test_regularization_blocked_on_approved_leave():
    db = MagicMock()
    company_id = uuid.uuid4()
    employee_id = uuid.uuid4()

    svc = AttendanceService(db, company_id)
    svc._get_approved_leave_on_date = MagicMock(
        return_value=_make_leave(employee_id, status="approved", leave_type_name="Annual Leave")
    )

    with pytest.raises(ValueError, match="cannot request attendance regularization.*approved Annual Leave"):
        svc.request_regularization(
            employee_id=employee_id,
            data={
                "record_date": date(2026, 11, 24),
                "requested_clock_in": datetime(2026, 11, 24, 4, 0, tzinfo=timezone.utc),
                "requested_clock_out": datetime(2026, 11, 24, 12, 0, tzinfo=timezone.utc),
                "reason": "Forgot to clock in",
            },
        )


def test_daily_overview_suppresses_stale_clock_in_on_approved_leave():
    db = MagicMock()
    company_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    target = date(2026, 11, 24)

    emp = SimpleNamespace(
        id=emp_id,
        full_name="Emily Davis",
        department=SimpleNamespace(name="Frontend"),
    )
    stale_record = SimpleNamespace(
        employee_id=emp_id,
        clock_in=datetime(2026, 11, 24, 12, 46, tzinfo=timezone.utc),  # 06:16 PM IST
        clock_out=None,
        face_status="unverified",
        face_review_status=None,
    )
    approved_leave = _make_leave(emp_id, status="approved", leave_type_name="Personal Leave")

    svc = AttendanceService(db, company_id)
    svc.repo.get_by_date_range = MagicMock(return_value=[stale_record])

    with patch("app.repositories.employee_repo.EmployeeRepository") as mock_emp_cls, \
         patch("app.repositories.leave_repo.LeaveRequestRepository") as mock_lr_cls:
        mock_emp_cls.return_value.get_directory.return_value = [emp]
        mock_lr_cls.return_value.get_overlapping_range.return_value = [approved_leave]

        overview = svc.get_daily_overview(target)

    assert len(overview["employees"]) == 1
    row = overview["employees"][0]
    assert row["status"] == "On Leave"
    assert row["leave_type"] == "Personal Leave"
    assert row["check_in"] is None
    assert row["check_out"] is None
    assert row["session_count"] == 0
    assert row["face_status"] is None
