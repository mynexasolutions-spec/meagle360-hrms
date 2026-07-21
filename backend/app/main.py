"""
Meagle360 HRMS — FastAPI Application Entry Point.

Registers all routers and configures CORS for frontend access.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routes import auth, company, department, employee, attendance, leave, shift, platform, dashboard, announcement, overtime, audit, role, expense, site, payroll, action_tracker

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    description="Phase 1 — Core HRMS: Employee Records, Attendance, Leave, Shifts",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ── Dynamic CORS Configuration ──────────────────────────────────────────
def get_allowed_origins() -> list[str]:
    origins = set()

    if settings.APP_BASE_URL:
        clean_url = settings.APP_BASE_URL.strip().rstrip("/")
        if clean_url:
            origins.add(clean_url)

    if settings.ALLOWED_ORIGINS:
        for item in settings.ALLOWED_ORIGINS.split(","):
            clean = item.strip().rstrip("/")
            if clean:
                origins.add(clean)

    return list(origins)

allowed_origins = get_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ────────────────────────────────────
app.include_router(platform.router)
app.include_router(auth.router)
app.include_router(company.router)
app.include_router(department.router)
app.include_router(site.router)
app.include_router(employee.router)
app.include_router(role.router)
app.include_router(attendance.router)
app.include_router(leave.router)
app.include_router(shift.router)
app.include_router(dashboard.router)
app.include_router(announcement.router)
app.include_router(overtime.router)
app.include_router(expense.router)
app.include_router(payroll.router)
app.include_router(audit.router)
app.include_router(action_tracker.router)


# Unhandled exceptions otherwise escape past CORSMiddleware entirely (FastAPI's
# default ServerErrorMiddleware sits outside it), so the browser sees a response
# with no Access-Control-Allow-Origin header and misreports it as a CORS failure
# instead of the real 500. Catching here keeps the response inside the normal
# middleware stack so CORS headers still get attached.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logging.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "app": settings.APP_NAME}
