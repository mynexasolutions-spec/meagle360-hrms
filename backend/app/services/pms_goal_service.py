"""PMS goal scoring helpers (pure functions, no DB access)."""

from decimal import ROUND_HALF_UP, Decimal

from app.services.pms_config_service import PmsConfigError

TWO = Decimal("0.01")
LOWER_BETTER_ZERO_ACTUAL = Decimal("200")


# ── Pure helpers ─────────────────────────────────────────────

def achievement_pct(actual: Decimal, target: Decimal, direction: str) -> Decimal:
    """Uncapped achievement %. lower_better: target/actual (0 actual = 200%)."""
    actual, target = Decimal(str(actual)), Decimal(str(target))
    if target <= 0:
        raise PmsConfigError("Target must be greater than zero")
    if direction == "lower_better":
        pct = LOWER_BETTER_ZERO_ACTUAL if actual <= 0 else target / actual * 100
    else:
        pct = actual / target * 100
    return pct.quantize(TWO, rounding=ROUND_HALF_UP)


def compute_goals_score(goals: list[tuple[Decimal, Decimal | None]],
                        cap: Decimal = Decimal("120"),
                        scale_max: Decimal = Decimal("5")) -> Decimal | None:
    """goals: [(weight, achievement_pct or None)]. None counts as 0%.
    Each achievement is capped at `cap`, weighted-averaged, mapped to the
    rating scale (100% -> scale_max) and clamped to scale_max. None when
    there are no goals."""
    if not goals:
        return None
    total_w = sum(Decimal(str(w)) for w, _ in goals)
    if total_w <= 0:
        return None
    acc = sum(
        Decimal(str(w)) * min(Decimal(str(a if a is not None else 0)), cap) / 100
        for w, a in goals)
    score = acc / total_w * scale_max
    return min(score, scale_max).quantize(TWO, rounding=ROUND_HALF_UP)
