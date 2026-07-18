"""
Meagle360 HRMS — FastAPI Application Entry Point.

Registers all routers and configures CORS for frontend access.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import auth, company, department, employee, attendance, leave, shift, platform, dashboard, announcement, overtime, audit, role, expense, site, payroll

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    description="Phase 1 — Core HRMS: Employee Records, Attendance, Leave, Shifts",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ── CORS — allow React dev server ────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "app": settings.APP_NAME}
