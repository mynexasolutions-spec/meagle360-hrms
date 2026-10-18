from decimal import Decimal as D

import pytest

from app.services.pms_config_service import PmsConfigError
from app.services.pms_cycle_service import next_status
from app.services.pms_goal_service import achievement_pct, compute_goals_score


def test_achievement_higher_better():
    assert achievement_pct(D("80"), D("100"), "higher_better") == D("80.00")
    assert achievement_pct(D("150"), D("100"), "higher_better") == D("150.00")


def test_achievement_lower_better():
    assert achievement_pct(D("5"), D("10"), "lower_better") == D("200.00")
    assert achievement_pct(D("20"), D("10"), "lower_better") == D("50.00")
    assert achievement_pct(D("0"), D("10"), "lower_better") == D("200.00")


def test_achievement_rejects_non_positive_target():
    with pytest.raises(PmsConfigError):
        achievement_pct(D("1"), D("0"), "higher_better")


def test_goals_score_full_and_partial():
    assert compute_goals_score([(D("100"), D("100"))]) == D("5.00")
    assert compute_goals_score([(D("50"), D("100")), (D("50"), D("50"))]) == D("3.75")


def test_goals_score_capped_and_clamped():
    # 300% is capped at 120% -> 6.0 raw, clamped to scale max 5
    assert compute_goals_score([(D("100"), D("300"))]) == D("5.00")
    # a high goal cannot hide a missed goal beyond the cap
    assert compute_goals_score([(D("50"), D("300")), (D("50"), D("0"))]) == D("3.00")


def test_goals_score_missing_progress_counts_zero_and_empty_is_none():
    assert compute_goals_score([(D("100"), None)]) == D("0.00")
    assert compute_goals_score([]) is None


def test_cycle_advance_transitions():
    assert next_status("goal_setting") == "rating"
    assert next_status("rating") == "review"
    for bad in ("draft", "review", "finalized", "closed"):
        with pytest.raises(PmsConfigError):
            next_status(bad)
