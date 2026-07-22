"""
SQLAlchemy engine and session factory.

Swap DATABASE_URL to Supabase connection string later — no code changes needed.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings

settings = get_settings()

db_url = settings.DATABASE_URL
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    db_url,
    pool_pre_ping=True,
    pool_size=3,
    max_overflow=2,
    pool_recycle=300,
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
