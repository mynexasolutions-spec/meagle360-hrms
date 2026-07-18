"""
SQLAlchemy engine and session factory.

Swap DATABASE_URL to Supabase connection string later — no code changes needed.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency — yields a scoped DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
