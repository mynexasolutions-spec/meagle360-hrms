from decimal import Decimal as D

from pydantic import BaseModel

import app.schemas.pms as pms_schemas
from app.services.pms_scoring import compute_final_score


def test_final_score_renormalises_when_pillars_missing():
    w = {"goals": D("50"), "competency": D("30"), "discipline": D("10"), "growth": D("10")}
    s = {"goals": D("4"), "competency": D("3"), "discipline": None, "growth": None}
    assert compute_final_score(s, w) == D("3.63")


def test_final_score_none_without_any_pillar():
    assert compute_final_score({"goals": None, "competency": None}, {"goals": 50}) is None


def test_no_schema_exposes_rater_identity():
    forbidden = {"rater_id", "rater_ids", "rater_name", "rater_employee_id"}
    for name in dir(pms_schemas):
        obj = getattr(pms_schemas, name)
        if isinstance(obj, type) and issubclass(obj, BaseModel) and obj is not BaseModel:
            assert not (forbidden & set(obj.model_fields)), name
