from decimal import Decimal as D
from types import SimpleNamespace
from uuid import uuid4

from pydantic import BaseModel

import app.schemas.pms as pms_schemas
from app.services.pms_assignment_service import eligible_department_peers
from app.services.pms_scoring import (
    compute_competency, compute_final_score, effective_rater_weights, trimmed_mean,
)

CFG = dict(weight_manager=D("50"), weight_peer=D("30"), weight_self=D("20"),
           max_peer_weight=D("30"), min_peer_responses=3, trim_outliers=True)


def test_trimmed_mean_drops_extremes_only_with_four_or_more():
    assert trimmed_mean([1, 5, 3, 4]) == D("3.5")
    assert trimmed_mean([1, 5, 3]) == D("3")
    assert trimmed_mean([1, 5, 3, 4], trim=False) == D("3.25")
    assert trimmed_mean([]) is None


def test_outlier_revenge_rating_is_neutralised():
    # one 1-star revenge rating among 4s does not move a 5-peer score
    assert trimmed_mean([1, 4, 4, 4, 4]) == D("4")


def test_effective_weights_default():
    w = effective_rater_weights(50, 30, 20, 30, True, True, True)
    assert (w["manager"], w["peer"], w["self"]) == (D("50"), D("30"), D("20"))


def test_peer_weight_capped_then_renormalised():
    w = effective_rater_weights(50, 40, 10, 30, True, True, True)
    assert sum(w.values()) == D("100")
    assert round(w["peer"], 2) == D("33.33")


def test_missing_peers_redistributes_proportionally():
    w = effective_rater_weights(50, 30, 20, 30, True, False, True)
    assert "peer" not in w
    assert round(w["manager"], 2) == D("71.43")
    assert round(w["self"], 2) == D("28.57")


def test_no_raters_gives_empty():
    assert effective_rater_weights(50, 30, 20, 30, False, False, False) == {}


PID = "p1"


def test_competency_blend_all_raters():
    r = {PID: {"self": [5], "manager": [3], "peer": [4, 4, 4]}}
    out = compute_competency(r, {PID: "Teamwork"}, 3, CFG)
    # 0.50*3 + 0.30*4 + 0.20*5 = 1.50 + 1.20 + 1.00 = 3.70
    assert out["competency_score"] == D("3.70")
    assert out["peer_score_insufficient"] is False
    assert out["breakdown"][0]["gap"] == "2.00"  # self - manager


def test_competency_insufficient_peers_ignored_and_flagged():
    r = {PID: {"self": [5], "manager": [3], "peer": [4, 4]}}
    out = compute_competency(r, {PID: "Teamwork"}, 2, CFG)
    assert out["peer_score_insufficient"] is True
    assert out["peer_avg"] is None
    # (50*3 + 20*5) / 70 = 250 / 70 = 3.57
    assert out["competency_score"] == D("3.57")


def test_competency_no_ratings():
    out = compute_competency({PID: {"self": [], "manager": [], "peer": []}},
                             {PID: "x"}, 0, CFG)
    assert out["competency_score"] is None


def test_final_score_renormalises_when_pillars_missing():
    w = {"goals": D("50"), "competency": D("30"), "discipline": D("10"), "growth": D("10")}
    s = {"goals": D("4"), "competency": D("3"), "discipline": None, "growth": None}
    assert compute_final_score(s, w) == D("3.63")


def test_final_score_none_without_any_pillar():
    assert compute_final_score({"goals": None, "competency": None}, {"goals": 50}) is None


def test_all_department_peers_excludes_self_manager_reports_and_other_depts():
    dept_a, dept_b = uuid4(), uuid4()
    mgr, emp, peer1, peer2, report, other_dept = [uuid4() for _ in range(6)]
    pool = [
        SimpleNamespace(employee_id=mgr, manager_id=None, department_id=dept_a),
        SimpleNamespace(employee_id=emp, manager_id=mgr, department_id=dept_a),
        SimpleNamespace(employee_id=peer1, manager_id=mgr, department_id=dept_a),
        SimpleNamespace(employee_id=peer2, manager_id=mgr, department_id=dept_a),
        SimpleNamespace(employee_id=report, manager_id=emp, department_id=dept_a),
        SimpleNamespace(employee_id=other_dept, manager_id=None, department_id=dept_b),
    ]
    peers = eligible_department_peers(pool[1], pool)
    assert set(peers) == {peer1, peer2}


def test_no_schema_exposes_rater_identity():
    forbidden = {"rater_id", "rater_ids", "rater_name", "rater_employee_id"}
    for name in dir(pms_schemas):
        obj = getattr(pms_schemas, name)
        if isinstance(obj, type) and issubclass(obj, BaseModel) and obj is not BaseModel:
            assert not (forbidden & set(obj.model_fields)), name
