"""Tests for Meagle AI Demo Chat Quota & Rate Limiting."""

import uuid
from datetime import date, datetime, timezone
import pytest
from fastapi import HTTPException

from app.database import SessionLocal
from app.models.company import Company
from app.models.employee import Employee
from app.models.user_account import UserAccount
from app.models.ai_chat_usage import AIChatUsage
from app.services.ai.quota_service import (
    DEFAULT_DEMO_DAILY_CHAT_LIMIT,
    is_demo_user,
    get_user_chat_quota,
    enforce_chat_quota,
    record_chat_usage,
)


def test_is_demo_user():
    company = Company(id=uuid.uuid4(), name="Test Corp", subdomain="testcorp", plan_tier="standard")
    
    # Quick demo accounts
    sarah = UserAccount(email="sarah@meagle360.com")
    michael = UserAccount(email="michael@meagle360.com")
    emily = UserAccount(email="emily@meagle360.com")
    regular_user = UserAccount(email="john.doe@enterprise.com")

    assert is_demo_user(sarah, company) is True
    assert is_demo_user(michael, company) is True
    assert is_demo_user(emily, company) is True
    assert is_demo_user(regular_user, company) is False

    # Trial company
    trial_company = Company(id=uuid.uuid4(), name="Trial Co", subdomain="trialco", plan_tier="trial")
    assert is_demo_user(regular_user, trial_company) is True


def test_quota_tracking_and_enforcement():
    db_session = SessionLocal()
    try:
        # Use existing seeded sarah@meagle360.com demo account
        user = db_session.query(UserAccount).filter(UserAccount.email == "sarah@meagle360.com").first()
        assert user is not None, "sarah@meagle360.com should exist in seeded database"
        company = db_session.query(Company).filter(Company.id == user.company_id).first()

        # Clean existing test usage for sarah
        db_session.query(AIChatUsage).filter(AIChatUsage.user_id == user.id).delete()
        db_session.commit()

        # Initial quota check
        quota = get_user_chat_quota(db_session, user, company)
        assert quota["is_demo"] is True
        assert quota["daily_limit"] == DEFAULT_DEMO_DAILY_CHAT_LIMIT  # 10
        assert quota["chats_today"] == 0
        assert quota["chats_remaining"] == 10
        assert quota["limit_reached"] is False

        # Record 9 chats
        for _ in range(9):
            record_chat_usage(db_session, company.id, user.id, message_type="chat")

        quota = get_user_chat_quota(db_session, user, company)
        assert quota["chats_today"] == 9
        assert quota["chats_remaining"] == 1
        assert quota["limit_reached"] is False

        # 10th chat
        record_chat_usage(db_session, company.id, user.id, message_type="chat")

        quota = get_user_chat_quota(db_session, user, company)
        assert quota["chats_today"] == 10
        assert quota["chats_remaining"] == 0
        assert quota["limit_reached"] is True

        # Enforce quota should now raise HTTP 429
        with pytest.raises(HTTPException) as exc_info:
            enforce_chat_quota(db_session, user, company)

        assert exc_info.value.status_code == 429
        assert "10" in exc_info.value.detail

        # Clean up
        db_session.query(AIChatUsage).filter(AIChatUsage.user_id == user.id).delete()
        db_session.commit()
    finally:
        db_session.close()
