"""
Application configuration — loaded from environment variables.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── Database ─────────────────────────────────────────
    DATABASE_URL: str = "postgresql://hrms_admin:hrms_secret_2024@localhost:5432/hrms"

    # ── JWT / Auth ───────────────────────────────────────
    JWT_SECRET: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ── App ──────────────────────────────────────────────
    APP_NAME: str = "Meagle360 HRMS"
    DEBUG: bool = False

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore"
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
