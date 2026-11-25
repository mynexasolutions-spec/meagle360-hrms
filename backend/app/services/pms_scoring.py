"""PMS score helpers: pure functions, no DB access."""

from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable

TWO = Decimal("0.01")
HUNDRED = Decimal("100")


def _d(v) -> Decimal:
    return v if isinstance(v, Decimal) else Decimal(str(v))


def q2(v: Decimal) -> Decimal:
    return v.quantize(TWO, rounding=ROUND_HALF_UP)


def mean(scores: Iterable) -> Decimal | None:
    xs = [_d(s) for s in scores]
    return sum(xs) / len(xs) if xs else None


def compute_final_score(pillar_scores: dict[str, Decimal | None],
                        pillar_weights: dict[str, Decimal],
                        scale_max: Decimal = Decimal("5")) -> Decimal | None:
    """Weighted blend of the pillars that have a score. Pillars with no
    score (e.g. discipline/growth not enabled yet) drop out and the rest
    are renormalised, so the result stays on the same scale."""
    num = Decimal("0")
    den = Decimal("0")
    for k, score in pillar_scores.items():
        w = _d(pillar_weights.get(k, 0))
        if score is None or w <= 0:
            continue
        num += w * _d(score)
        den += w
    if den == 0:
        return None
    return q2(min(num / den, _d(scale_max)))
