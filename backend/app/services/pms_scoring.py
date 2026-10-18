"""PMS scoring engine — pure functions, no DB access.

Scale: every score is on the rating scale (default 1-5, goals 0-5).

Competency blend per parameter:
    blended = sum(w_i * score_i) / sum(w_i)   over the raters that count
where
  - the peer weight is first capped at max_peer_weight,
  - a rater type that is absent (no manager, no self rating) or, for
    peers, below the minimum response count, is dropped, and the
    remaining weights are renormalised (this also redistributes any
    capped-off peer weight proportionally).

Peer score per parameter is a trimmed mean (drop one highest and one
lowest) when trimming is on and there are >= 4 responses; otherwise a
plain mean.
"""

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


def trimmed_mean(scores: Iterable, trim: bool = True) -> Decimal | None:
    xs = sorted(_d(s) for s in scores)
    if not xs:
        return None
    if trim and len(xs) >= 4:
        xs = xs[1:-1]
    return sum(xs) / len(xs)


def effective_rater_weights(
    w_manager, w_peer, w_self, max_peer_weight,
    has_manager: bool, has_peer: bool, has_self: bool,
) -> dict[str, Decimal]:
    """Normalised (sum = 100) weights for the rater types that count.
    Empty dict when no rater type is available."""
    raw: dict[str, Decimal] = {}
    if has_manager:
        raw["manager"] = _d(w_manager)
    if has_peer:
        raw["peer"] = min(_d(w_peer), _d(max_peer_weight))
    if has_self:
        raw["self"] = _d(w_self)
    total = sum(raw.values(), Decimal("0"))
    if total <= 0:
        # Weights configured as 0 for everything available: fall back to equal split.
        if not raw:
            return {}
        return {k: HUNDRED / len(raw) for k in raw}
    return {k: v / total * HUNDRED for k, v in raw.items()}


def compute_competency(
    ratings: dict[str, dict[str, list]],
    parameter_names: dict[str, str],
    peer_response_count: int,
    cfg: dict,
) -> dict:
    """ratings: {parameter_id: {"self": [..], "manager": [..], "peer": [..]}}.

    Returns dict with competency_score, self_avg, manager_avg, peer_avg,
    peer_score_insufficient, weights (effective) and breakdown (list)."""
    trim = bool(cfg.get("trim_outliers", True))
    min_peers = int(cfg["min_peer_responses"])
    peer_ok = peer_response_count >= min_peers

    has_self = any(r.get("self") for r in ratings.values())
    has_manager = any(r.get("manager") for r in ratings.values())
    has_peer = peer_ok and any(r.get("peer") for r in ratings.values())

    weights = effective_rater_weights(
        cfg["weight_manager"], cfg["weight_peer"], cfg["weight_self"],
        cfg["max_peer_weight"], has_manager, has_peer, has_self)

    breakdown, blended_all = [], []
    self_all, mgr_all, peer_all = [], [], []
    for pid, by_type in ratings.items():
        s = mean(by_type.get("self", []))
        m = mean(by_type.get("manager", []))
        p = trimmed_mean(by_type.get("peer", []), trim) if peer_ok else None
        comps = {"self": s, "manager": m, "peer": p}
        usable = {k: v for k, v in comps.items() if v is not None and k in weights}
        blended = None
        if usable:
            wsum = sum(weights[k] for k in usable)
            blended = sum(weights[k] * v for k, v in usable.items()) / wsum
            blended_all.append(blended)
        if s is not None:
            self_all.append(s)
        if m is not None:
            mgr_all.append(m)
        if p is not None:
            peer_all.append(p)
        breakdown.append({
            "parameter_id": pid,
            "name": parameter_names.get(pid, ""),
            "self": str(q2(s)) if s is not None else None,
            "manager": str(q2(m)) if m is not None else None,
            "peer": str(q2(p)) if p is not None else None,
            "gap": str(q2(s - m)) if (s is not None and m is not None) else None,
            "blended": str(q2(blended)) if blended is not None else None,
        })

    def avg(xs):
        v = mean(xs)
        return q2(v) if v is not None else None

    comp = mean(blended_all)
    return {
        "competency_score": q2(comp) if comp is not None else None,
        "self_avg": avg(self_all),
        "manager_avg": avg(mgr_all),
        "peer_avg": avg(peer_all),
        "peer_score_insufficient": not peer_ok,
        "weights": {k: str(q2(v)) for k, v in weights.items()},
        "breakdown": breakdown,
    }


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
