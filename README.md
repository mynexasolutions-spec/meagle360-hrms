# Meagle360 HRMS

A multi-tenant Human Resource Management System. React (Vite) frontend + FastAPI backend + Supabase-hosted Postgres. Built for **Nexa Solutions** (the platform operator) to provision company tenants, who in turn onboard their own employees.

---

## Architecture

```
backend/
├── app/
│   ├── models/         # SQLAlchemy ORM models
│   ├── schemas/        # Pydantic request/response validation
│   ├── repositories/   # Data-access layer (every query company-scoped)
│   ├── services/       # Business logic
│   ├── routes/         # FastAPI endpoint definitions
│   ├── dependencies.py # Shared auth, company-scoping, permission checks
│   └── main.py         # App entry point — registers all routers
├── alembic/versions/   # Migrations — the source of truth for schema history
├── seed.py             # Demo tenant (Meagle360 Corp) + Admin/Manager/Employee
├── seed_platform.py    # Nexa Solutions platform super-admin account
└── seed_dummy_org.py   # Second demo tenant with one user per role (RBAC testing)

frontend/src/
├── api/         # Axios client + one file per resource
├── context/     # AuthContext (tenant) / PlatformAuthContext (platform)
├── layouts/     # Dashboard / Auth / Platform shells
├── pages/       # One component per screen
└── components/  # Shared UI (Modal, Sidebar, TopBar, StatCard, ...)

run.py           # Launches backend (uvicorn) + frontend (vite) together
```

### Key design decisions
- **Company-scoped multi-tenancy**: every repository filters by `company_id` through a shared base class — not per-endpoint, so it can't be forgotten.
- **Two separate auth surfaces**: platform admins (Nexa Solutions staff) and tenant users (Admin/Manager/Employee/...) get structurally different JWTs (`type: platform` vs `type: tenant`). A token from one can never be used against the other's routes.
- **RBAC via JSON permissions**: each `Role` has a `permissions` dict (e.g. `employees:write`, `payroll:approve`). Enforced on both the frontend (sidebar visibility, route guards) and backend (`require_permissions(...)` dependency) — hiding a nav item is never the only protection.
- **Multi-role support**: a user's primary role plus any additional granted roles are merged (union of permissions) — used e.g. to grant "Payroll Manager" access to someone without changing their primary role.
- **Invite-link onboarding**: new logins (platform→company Admin, or Admin→employee) are created with an unusable placeholder password and a 48h invite token; the recipient sets their own real password via `/set-password`. No email provider is wired up yet — links are generated and shared manually.

---

## Prerequisites
- A Supabase project (Postgres is hosted there — no local database required)
- Python 3.10+
- Node.js 18+

---

## Setup (first time only)

### 1. Environment variables
Copy `.env.example` to `backend/.env` and fill in:
```bash
DATABASE_URL=postgresql://postgres.<project-ref>:<url-encoded-password>@<pooler-host>:5432/postgres
JWT_SECRET=<a random 64-char string>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```
Get `DATABASE_URL` from your Supabase project: **Project Settings → Database → Connection string → URI**. If your database password contains special characters (`@`, `#`, etc.), URL-encode them.

### 2. Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

pip install -r requirements.txt

# Apply all migrations
alembic upgrade head

# Seed the Nexa Solutions platform super-admin account
python -m app.seed_platform

# Seed the demo tenant (Meagle360 Corp) with Admin/Manager/Employee
python -m app.seed

# Optional: a second demo tenant with one user per role (good for testing RBAC)
python -m app.seed_dummy_org
```

> The demo tenant from `seed.py` gets only the core Admin/Manager/Employee roles and no Expense/Payroll/Site starter data (it predates those modules and builds its company record directly). Companies created through the normal platform provisioning flow (`POST /api/platform/companies`) get the full default set: all 7 roles, default expense categories, default salary components, and a "Loss of Pay" leave type.

### 3. Frontend
```bash
cd frontend
npm install
```

---

## Running the project

From the repository root, after setup is complete:

```bash
python run.py
```

This starts both the backend (`uvicorn`, with `--reload`) and the frontend (`vite`) in one process, streaming both logs to your terminal. Stop both with `Ctrl+C`.

- **Frontend**: http://localhost:5173
- **Backend / API docs**: http://localhost:8015/api/docs *(port is set in `run.py` — see note below)*

To run them separately instead (two terminals):
```bash
# Terminal 1
cd backend && venv\Scripts\activate && uvicorn app.main:app --reload --port 8015

# Terminal 2
cd frontend && npm run dev
```

### About the backend port
`run.py` and `frontend/src/api/client.js` / `frontend/src/api/platform.js` must always point at the **same port**. It's currently `8015` because this port has had to be bumped several times during development on Windows — see [Known Issues](#known-issues) below. If you're starting fresh (e.g. on a different machine or after a reboot), feel free to change all three files back to `8000` or any port of your choice; there's nothing meaningful about `8015` itself.

---

## Demo Credentials

**Platform (Nexa Solutions) — logs in at `/platform/login`:**

| Role | Email | Password |
|---|---|---|
| Super Admin | contact@nexa-solutions.in | Hireberth@0302 |

**Meagle360 Corp (demo tenant) — logs in at `/login`:**

| Role | Email | Password |
|---|---|---|
| Admin | sarah@meagle360.com | admin123 |
| Manager | michael@meagle360.com | manager123 |
| Employee | emily@meagle360.com | employee123 |

If you ran `seed_dummy_org.py`, "Dummy Test Org" has one user per role (Admin, Manager, Employee, HR Manager, Expense Manager, Helpdesk Manager, Project Admin) — check that script for the exact emails/passwords it creates.

### Platform → Tenant onboarding flow
1. `POST /api/platform/companies` — creates a company (`status=pending_setup`) with all default roles, expense categories, salary components, and leave types seeded.
2. `POST /api/platform/companies/{id}/admin` — creates that company's first Admin and returns a 48h invite token (would be emailed in production; returned directly in the response today).
3. The invited Admin calls `POST /api/auth/set-password` with the token to set a real password — this flips the company to `status=active`.
4. The Admin logs in and invites their own employees via `POST /api/employees/invite` (same invite-link pattern, from the Employee Directory UI).

---

## Features

| Module | Status |
|---|---|
| Employee Management | Directory, invite-with-login-and-role flow, profile (photo, personal info, documents), deactivate/reactivate, resend invite |
| Attendance | Clock-in/out, regularization requests, overtime requests, holiday calendar, per-employee monthly view merging attendance + leave + holidays + overtime |
| Leave | Configurable leave types (with paid/unpaid flag), balances, requests + approval |
| Shifts | Shift definitions, employee assignment, roster |
| Expense Management | Claims, categories, approve/reject/reimburse, company-wide ledger |
| Payroll Management | Configurable salary components/structures (India-standard defaults pre-seeded, fully editable), employee salary assignment, automatic Loss-of-Pay calculation, payroll runs with manual adjustments and finalize-lock, employee self-service payslips |
| Sites | Multiple work locations per company, employee assignment/transfer |
| Multi-role access | Grant additional roles to a user (e.g. Payroll Manager) without changing their primary role |
| Dashboard | Live stats, attendance trend, leave summary, "Who's Online" widget, announcements, quick actions |
| Reports & Analytics | Attendance trend, headcount by department, leave summary |
| Documents | Per-employee document storage, Admin can upload on an employee's behalf |
| Audit Log | Tracks approvals, employee CRUD, payroll actions, etc. |
| Platform layer | Tenant provisioning, lifecycle (suspend/reactivate/cancel), company user visibility |

### Explicitly not built (by design, not oversight)
- Email delivery (invite links and payslips are generated in-app, not emailed)
- PDF generation / downloadable payslips
- Real statutory tax compliance (Payroll's India defaults are an editable starting point, not certified compliance)
- Bank disbursement / direct deposit
- Per-site role scoping, Manager-to-direct-reports scoping
- Task/Project Management and Helpdesk (permission keys exist for their roles; no feature built yet)
- SSO, biometric/GPS clock-in, native mobile apps

---

## Known Issues

**Unkillable phantom process on Windows.** This dev environment has repeatedly hit an issue where a backend process keeps answering on its port even after being killed (`taskkill` reports success, but the port stays bound, sometimes to a PID Windows no longer lists at all). Symptom: the app looks stuck on stale code/data, or the frontend shows a raw "Network Error." Fix: pick a new port in `run.py` + both frontend API client files, and restart. This has nothing to do with the application code itself.
