"""AI Chat Quota & Rate Limiting Service.

Tracks and enforces the daily 10-chats quota for demo accounts (Sarah, Michael, Emily)
and any trial/demo tenants, resetting daily at midnight IST.
"""

from datetime import datetime, time, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.ai_chat_usage import AIChatUsage
from app.models.company import Company
from app.models.user_account import UserAccount
from app.services.attendance_service import IST_OFFSET
from app.services.ai.tools import get_ist_today

DEFAULT_DEMO_DAILY_CHAT_LIMIT = 10

# Primary 1-click Quick Demo Accounts from Login page
DEMO_EMAILS = {
    "sarah@meagle360.com",
    "michael@meagle360.com",
    "emily@meagle360.com",
}


def is_demo_user(user: UserAccount, company: Company | None = None) -> bool:
    """Return True if this account is one of the Quick Demo accounts or belonging to a demo/trial tenant."""
    email = (user.email or "").strip().lower()
    if email in DEMO_EMAILS or email.startswith("demo"):
        return True

    if company is not None:
        if (company.plan_tier or "").strip().lower() in ("trial", "demo"):
            return True
        if (company.subdomain or "").strip().lower() in ("demo", "test"):
            return True

    return False


def get_start_of_ist_day_utc() -> datetime:
    """Return the 00:00:00 IST boundary for today converted to UTC."""
    today_ist = get_ist_today()
    start_dt = datetime.combine(today_ist, time.min) - IST_OFFSET
    return start_dt.replace(tzinfo=timezone.utc)


def get_user_chat_quota(
    db: Session,
    user: UserAccount,
    company: Company | None = None,
) -> dict[str, Any]:
    """Retrieve today's AI chat usage and remaining limit for a user."""
    demo = is_demo_user(user, company)
    limit = DEFAULT_DEMO_DAILY_CHAT_LIMIT if demo else None

    start_of_day_utc = get_start_of_ist_day_utc()

    chats_today = (
        db.query(AIChatUsage)
        .filter(
            AIChatUsage.user_id == user.id,
            AIChatUsage.created_at >= start_of_day_utc,
            AIChatUsage.message_type == "chat",
        )
        .count()
    )

    remaining = max(0, limit - chats_today) if limit is not None else None
    limit_reached = bool(limit is not None and chats_today >= limit)

    return {
        "is_demo": demo,
        "daily_limit": limit,
        "chats_today": chats_today,
        "chats_remaining": remaining,
        "limit_reached": limit_reached,
        "resets_at": "12:00 AM IST",
    }


def enforce_chat_quota(
    db: Session,
    user: UserAccount,
    company: Company | None = None,
) -> dict[str, Any]:
    """Enforce quota check. Raises HTTP 429 if daily demo limit has been exhausted."""
    quota = get_user_chat_quota(db, user, company)
    if quota["limit_reached"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Aapne aaj ki demo chat limit ({quota['daily_limit']} chats) poori kar li hai! "
                "Yeh kal subah 12:00 AM IST par reset ho jayegi. Full access ke liye upgrade karein."
            ),
        )
    return quota


def record_chat_usage(
    db: Session,
    company_id: UUID,
    user_id: UUID,
    message_type: str = "chat",
) -> AIChatUsage:
    """Record a chat invocation in the ai_chat_usage table."""
    record = AIChatUsage(
        company_id=company_id,
        user_id=user_id,
        message_type=message_type,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
