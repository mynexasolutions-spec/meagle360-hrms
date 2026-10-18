from datetime import date
from decimal import Decimal as D
from types import SimpleNamespace

from app.services.pms_payroll_service import compute_hiked_pay, evaluate_hike_eligibility
from app.services.pms_results_service import (
    effective_score_of, is_sick_leave_name, summarize_attendance,
)


def test_sick_leave_detection():
    assert is_sick_leave_name("Sick Leave") is True
    assert is_sick_leave_name("Medical Leave") is True
    assert is_sick_leave_name("Casual Leave") is False
    assert is_sick_leave_name(None) is False


def test_attendance_summary_does_not_penalize_sick_leave():
    # Week of Mon 2026-10-05 .. Fri 2026-10-09 (5 working days)
    # Employee present 3 days, took 2 days Sick Leave -> 3 / (5 - 2) = 100.00%
    start = date(2026, 10, 5)
    end = date(2026, 10, 9)
    present = {date(2026, 10, 5), date(2026, 10, 6), date(2026, 10, 7)}
    leaves = [(date(2026, 10, 8), date(2026, 10, 9), True)]
    snap = summarize_attendance(start, end, date(2025, 1, 1), set(), present, 1, leaves)
    assert snap["working_days"] == 5
    assert snap["present_days"] == 3
    assert snap["sick_leave_days"] == 2
    assert snap["other_leave_days"] == 0
    assert snap["late_count"] == 1
    assert snap["attendance_pct"] == "100.00"


def test_attendance_summary_counts_non_sick_leave_against_working_days():
    # 5 working days, 3 present, 2 casual leave -> 3 / 5 = 60.00%
    start = date(2026, 10, 5)
    end = date(2026, 10, 9)
    present = {date(2026, 10, 5), date(2026, 10, 6), date(2026, 10, 7)}
    leaves = [(date(2026, 10, 8), date(2026, 10, 9), False)]
    snap = summarize_attendance(start, end, date(2025, 1, 1), set(), present, 0, leaves)
    assert snap["other_leave_days"] == 2
    assert snap["attendance_pct"] == "60.00"


def test_effective_score_prefers_adjusted_over_final():
    p1 = SimpleNamespace(final_score=D("3.50"), adjusted_score=D("4.20"))
    p2 = SimpleNamespace(final_score=D("3.50"), adjusted_score=None)
    assert effective_score_of(p1) == D("4.20")
    assert effective_score_of(p2) == D("3.50")


def test_compute_hiked_pay():
    new_basic, new_ctc = compute_hiked_pay(D("50000.00"), D("600000.00"), D("12"))
    assert new_basic == D("56000.00")
    assert new_ctc == D("672000.00")


def test_hike_eligibility_checks_status_tenure_and_score():
    ok, reason = evaluate_hike_eligibility(
        "active", date(2025, 1, 1), date(2026, 10, 1), 180, D("4.00")
    )
    assert ok is True and reason is None

    ok_short, reason_short = evaluate_hike_eligibility(
        "active", date(2026, 8, 1), date(2026, 10, 1), 180, D("4.00")
    )
    assert ok_short is False and "Tenure" in reason_short

    ok_inactive, _ = evaluate_hike_eligibility(
        "resigned", date(2024, 1, 1), date(2026, 10, 1), 180, D("4.00")
    )
    assert ok_inactive is False

    ok_noscore, _ = evaluate_hike_eligibility(
        "active", date(2024, 1, 1), date(2026, 10, 1), 180, None
    )
    assert ok_noscore is False
