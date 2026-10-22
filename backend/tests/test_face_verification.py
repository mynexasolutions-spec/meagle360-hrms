"""Unit tests for Face Verification service and clock-in evaluation."""

import uuid
from unittest.mock import MagicMock, patch
import pytest

from app.models.company import Company
from app.models.employee import Employee
from app.models.face_profile import EmployeeFaceProfile
from app.models.attendance_record import AttendanceRecord
from app.services import face_engine
from app.services.face_service import FaceService


def test_cosine_similarity():
    v1 = [1.0, 0.0, 0.0]
    v2 = [1.0, 0.0, 0.0]
    assert pytest.approx(face_engine.cosine_similarity(v1, v2)) == 1.0

    v3 = [0.0, 1.0, 0.0]
    assert pytest.approx(face_engine.cosine_similarity(v1, v3)) == 0.0

    v4 = [0.7071, 0.7071, 0.0]
    assert 0.7 <= face_engine.cosine_similarity(v1, v4) <= 0.72


def test_evaluate_clock_in_feature_disabled():
    db = MagicMock()
    company_id = uuid.uuid4()
    company = Company(id=company_id, face_verification_enabled=False)
    db.query.return_value.filter.return_value.first.return_value = company

    svc = FaceService(db, company_id)
    res = svc.evaluate_clock_in(employee_id=uuid.uuid4(), selfie=None, liveness_passed=False)
    assert res is None


def test_evaluate_clock_in_no_approved_photo():
    db = MagicMock()
    company_id = uuid.uuid4()
    company = Company(id=company_id, face_verification_enabled=True)
    # Return company for first query, None for profile query
    db.query.return_value.filter.return_value.first.side_effect = [company, None]

    svc = FaceService(db, company_id)
    res = svc.evaluate_clock_in(employee_id=uuid.uuid4(), selfie=None, liveness_passed=False)
    assert res == {"face_status": "unverified"}


def test_evaluate_clock_in_missing_selfie_when_required():
    db = MagicMock()
    company_id = uuid.uuid4()
    company = Company(id=company_id, face_verification_enabled=True)
    profile = EmployeeFaceProfile(status="approved", embedding=[0.5] * 128)
    db.query.return_value.filter.return_value.first.side_effect = [company, profile]

    svc = FaceService(db, company_id)
    with pytest.raises(ValueError, match="live selfie is required"):
        svc.evaluate_clock_in(employee_id=uuid.uuid4(), selfie=None, liveness_passed=True)


def test_evaluate_clock_in_liveness_failed():
    db = MagicMock()
    company_id = uuid.uuid4()
    company = Company(id=company_id, face_verification_enabled=True)
    profile = EmployeeFaceProfile(status="approved", embedding=[0.5] * 128)
    db.query.return_value.filter.return_value.first.side_effect = [company, profile]

    svc = FaceService(db, company_id)
    res = svc.evaluate_clock_in(
        employee_id=uuid.uuid4(),
        selfie="data:image/jpeg;base64,dGVzdA==",
        liveness_passed=False
    )
    assert res["face_status"] == "flagged"
    assert res["face_flag_reason"] == "liveness_failed"
    assert res["face_review_status"] == "pending"


@patch("app.services.face_engine.extract_embedding")
def test_evaluate_clock_in_match_verified(mock_extract):
    db = MagicMock()
    company_id = uuid.uuid4()
    company = Company(id=company_id, face_verification_enabled=True)
    emb = [1.0] + [0.0] * 127
    profile = EmployeeFaceProfile(status="approved", embedding=emb)
    db.query.return_value.filter.return_value.first.side_effect = [company, profile]

    mock_extract.return_value = emb  # Exact match (sim = 1.0 >= 0.4)

    svc = FaceService(db, company_id)
    res = svc.evaluate_clock_in(
        employee_id=uuid.uuid4(),
        selfie="data:image/jpeg;base64,dGVzdA==",
        liveness_passed=True
    )
    assert res["face_status"] == "verified"
    assert res["face_score"] >= 0.4


@patch("app.services.face_engine.extract_embedding")
def test_evaluate_clock_in_mismatch_flagged(mock_extract):
    db = MagicMock()
    company_id = uuid.uuid4()
    company = Company(id=company_id, face_verification_enabled=True)
    profile_emb = [1.0] + [0.0] * 127
    selfie_emb = [0.0, 1.0] + [0.0] * 126
    profile = EmployeeFaceProfile(status="approved", embedding=profile_emb)
    db.query.return_value.filter.return_value.first.side_effect = [company, profile]

    mock_extract.return_value = selfie_emb  # Orthogonal vector (sim = 0.0 < 0.4)

    svc = FaceService(db, company_id)
    res = svc.evaluate_clock_in(
        employee_id=uuid.uuid4(),
        selfie="data:image/jpeg;base64,dGVzdA==",
        liveness_passed=True
    )
    assert res["face_status"] == "flagged"
    assert res["face_flag_reason"] == "mismatch"
    assert res["face_review_status"] == "pending"
