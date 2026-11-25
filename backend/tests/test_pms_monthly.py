from datetime import date
from decimal import Decimal as D

import pytest

from app.services.pms_config_service import PmsConfigError
from app.services.pms_monthly_service import (
    achievement_pct, add_months, last_open_month, month_end, monthly_score, parse_month,
    review_due_on, review_opens_on,
)


def test_month_helpers():
    assert parse_month("2026-11") == date(2026, 11, 1)
    assert month_end(date(2028, 2, 1)) == date(2028, 2, 29)
    assert add_months(date(2026, 12, 1), 1) == date(2027, 1, 1)
    assert add_months(date(2026, 1, 1), -1) == date(2025, 12, 1)


@pytest.mark.parametrize("bad", ["2026", "2026-13", "nov", "0001-01"])
def test_parse_month_rejects(bad):
    with pytest.raises(PmsConfigError):
        parse_month(bad)


def test_review_window():
    assert review_opens_on(date(2026, 11, 1), 3) == date(2026, 11, 28)
    assert review_opens_on(date(2026, 11, 1), 1) == date(2026, 11, 30)
    # 31 means the whole month, even in shorter months
    assert review_opens_on(date(2027, 2, 1), 31) == date(2027, 2, 1)
    assert review_due_on(date(2026, 12, 1), 5) == date(2027, 1, 5)
    assert review_due_on(date(2027, 1, 1), 28) == date(2027, 2, 28)


def test_planning_is_open_to_end_of_next_year():
    assert last_open_month(date(2026, 11, 25)) == date(2027, 12, 1)
    assert last_open_month(date(2027, 1, 1)) == date(2028, 12, 1)


def test_score_blends_goals_and_rating():
    assert monthly_score(D("5"), 4, 60, 40) == D("4.60")
    # legacy 50/30/10/10 config: only goals and rating count, renormalised
    assert monthly_score(D("5"), 3, 50, 30) == D("4.25")


def test_score_without_goals_is_just_the_rating():
    assert monthly_score(None, 4, 60, 40) == D("4.00")
    assert monthly_score(None, 4, 100, 0) == D("4.00")


def test_unreviewed_month_has_no_score():
    assert monthly_score(D("5"), None, 60, 40) is None


def test_achievement_fits_column():
    assert achievement_pct(D("1000000"), D("1"), "higher_better") == D("999")
