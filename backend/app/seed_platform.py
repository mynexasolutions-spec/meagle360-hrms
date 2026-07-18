"""
Seed script — creates the Nexa Solutions platform (super-admin) account.

Usage:
    cd backend
    python -m app.seed_platform
"""

import uuid

from app.database import SessionLocal
from app.models import PlatformAdmin
from app.services.auth_service import hash_password

NEXA_ADMIN_EMAIL = "contact@nexa-solutions.in"
NEXA_ADMIN_PASSWORD = "Hireberth@0302"


def seed():
    db = SessionLocal()
    try:
        if db.query(PlatformAdmin).filter(PlatformAdmin.email == NEXA_ADMIN_EMAIL).first():
            print("Platform admin already exists. Skipping.")
            return

        print("Seeding platform admin...")
        admin = PlatformAdmin(
            id=uuid.uuid4(),
            email=NEXA_ADMIN_EMAIL,
            password_hash=hash_password(NEXA_ADMIN_PASSWORD),
            full_name="Nexa Solutions",
            is_super_admin=True,
        )
        db.add(admin)
        db.commit()
        print("Platform admin seeded!")
        print(f"   Login: {NEXA_ADMIN_EMAIL} / {NEXA_ADMIN_PASSWORD}")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
