from decimal import Decimal as D

import pytest

from app.services.pms_config_service import (
    PmsConfigError, find_slab_overlap, pick_slab, validate_weights,
)

BASE = dict(
    weight_goals=50, weight_competency=30, weight_discipline=10, weight_growth=10,
    weight_manager=50, weight_peer=30, weight_self=20, max_peer_weight=30,
    min_peer_responses=3,
)


def test_default_weights_valid():
    validate_weights(BASE)


def test_pillar_weights_must_sum_100():
    with pytest.raises(PmsConfigError, match="Pillar"):
        validate_weights({**BASE, "weight_goals": 60})


def test_rater_weights_must_sum_100():
    with pytest.raises(PmsConfigError, match="Rater"):
        validate_weights({**BASE, "weight_self": 30})


def test_peer_weight_capped():
    with pytest.raises(PmsConfigError, match="max_peer_weight"):
        validate_weights({**BASE, "weight_peer": 40, "weight_manager": 40})


def test_min_responses_positive():
    with pytest.raises(PmsConfigError, match="min_peer_responses"):
        validate_weights({**BASE, "min_peer_responses": 0})


def test_slab_overlap_detected_and_adjacent_ok():
    assert find_slab_overlap([(D("0"), D("2.5")), (D("2.5"), D("3.5"))]) is None
    assert find_slab_overlap([(D("0"), D("3")), (D("2.5"), D("3.5"))]) is not None


SLABS = [
    {"min_score": D("0"), "max_score": D("2.5"), "hike_percent": 0},
    {"min_score": D("2.5"), "max_score": D("3.5"), "hike_percent": 4},
    {"min_score": D("3.5"), "max_score": D("4.5"), "hike_percent": 8},
    {"min_score": D("4.5"), "max_score": D("5"), "hike_percent": 12},
]


@pytest.mark.parametrize("score,hike", [
    ("0", 0), ("2.49", 0), ("2.5", 4), ("3.5", 8), ("4.49", 8), ("4.5", 12), ("5", 12),
])
def test_pick_slab_boundaries(score, hike):
    assert pick_slab(SLABS, D(score))["hike_percent"] == hike


def test_pick_slab_none_when_no_slabs_or_out_of_range():
    assert pick_slab([], D("3")) is None
    assert pick_slab(SLABS, D("5.1")) is None
