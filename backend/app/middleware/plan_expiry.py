"""Plan-expiry enforcement middleware.

Single central place (per the codebase convention already established in
app/dependencies.py for company-scoped access) that blocks a tenant whose
plan has expired from doing anything except a small allowlist of routes:
logging in, checking their own profile, and viewing their own subscription
status. Everything else gets a 402 with a machine-readable error_code so
the frontend can reliably show the "plan ended" screen.

Deliberately implemented as middleware rather than inside get_current_user:
a dependency-level block would also block the allowlisted routes (they
depend on get_current_user / require_admin_role too), and duplicating an
allowlist check into every dependency is more error-prone than one place
that inspects the request path directly.
"""
from datetime import datetime, timezone

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

import sqlalchemy as sa

from app.database import SessionLocal
from app.services.auth_service import decode_token

# Exact-path routes a tenant user may still hit once their plan has expired.
ALLOWED_PATHS_WHEN_EXPIRED = {
    "/api/auth/login",
    "/api/auth/me",
    "/api/companies/me/subscription",
}

# Path prefixes that are never subject to this check at all — platform
# admin has its own entirely separate auth surface, and these are
# infra/docs routes with no tenant scoping.
EXEMPT_PREFIXES = (
    "/api/platform",
    "/api/docs",
    "/api/redoc",
    "/api/openapi.json",
    "/api/health",
)


class PlanExpiryMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if path.startswith(EXEMPT_PREFIXES):
            return await call_next(request)

        if path in ALLOWED_PATHS_WHEN_EXPIRED:
            return await call_next(request)

        auth_header = request.headers.get("authorization", "")
        if not auth_header.lower().startswith("bearer "):
            # No/malformed token — let the route's own auth dependency
            # produce the right 401, not our business to judge here.
            return await call_next(request)

        token = auth_header[7:]
        payload = decode_token(token)
        if not payload or payload.get("type") != "tenant":
            # Invalid token or a platform-admin token — not our concern.
            return await call_next(request)

        company_id = payload.get("company_id")
        if not company_id:
            return await call_next(request)

        db = SessionLocal()
        try:
            row = db.execute(
                sa.text("SELECT plan_ends_at FROM company WHERE id = :id"),
                {"id": company_id},
            ).first()
        finally:
            db.close()

        if row is None or row[0] is None:
            return await call_next(request)

        plan_ends_at = row[0]
        if plan_ends_at.tzinfo is None:
            plan_ends_at = plan_ends_at.replace(tzinfo=timezone.utc)

        if plan_ends_at <= datetime.now(timezone.utc):
            return JSONResponse(
                status_code=402,
                content={
                    "error_code": "plan_expired",
                    "message": "Your plan has ended. Purchase a plan to continue.",
                },
            )

        return await call_next(request)
