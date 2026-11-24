"""
Seed script — creates the Nexa Solutions platform (super-admin) account
using PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD from backend/.env.

Usage:
    cd backend
    python -m app.seed_platform
"""

import uuid

from app.config import get_settings
from app.database import SessionLocal
from app.models import PlatformAdmin
from app.services.auth_service import hash_password


def seed():
    settings = get_settings()
    admin_email = (settings.PLATFORM_ADMIN_EMAIL or "").strip()
    admin_password = settings.PLATFORM_ADMIN_PASSWORD or ""

    if not admin_email or not admin_password:
        raise RuntimeError(
            "PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD must be set in backend/.env "
            "before running app.seed_platform."
        )

    db = SessionLocal()
    try:
        if db.query(PlatformAdmin).filter(PlatformAdmin.email == admin_email).first():
            print("Platform admin already exists. Skipping.")
            return

        print("Seeding platform admin...")
        admin = PlatformAdmin(
            id=uuid.uuid4(),
            email=admin_email,
            password_hash=hash_password(admin_password),
            full_name="Nexa Solutions",
            is_super_admin=True,
        )
        db.add(admin)
        db.commit()
        print(f"Platform admin seeded successfully for: {admin_email}")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
