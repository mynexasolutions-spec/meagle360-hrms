from datetime import date
from decimal import Decimal as D
from types import SimpleNamespace

from app.services.pms_payroll_service import compute_hiked_pay, evaluate_hike_eligibility
from app.services.pms_results_service import effective_score_of


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
