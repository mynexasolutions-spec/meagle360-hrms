"""Promotions, demotions, transfers: rules, access and what each viewer sees."""

import uuid
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.dependencies import get_company_id, get_current_user
from app.models import Base
from app.models.ats import JobOpening
from app.models.audit_log import AuditLog
from app.models.company import Company
from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee
from app.models.employee_job_change import EmployeeJobChange
from app.models.employee_salary_assignment import EmployeeSalaryAssignment
from app.models.notification import Notification
from app.models.org_planning import ScheduledJobChange
from app.routes import department, designation, employee, job_change, organization
from app.services import scheduled_job_change_service
from app.services.pms_monthly_service import today_ist

TABLES = ["company", "employee", "department", "designation", "audit_log", "notification", "employee_job_change",
          "employee_salary_assignment", "salary_structure",
          "scheduled_job_change", "vacant_position", "job_openings"]
TODAY = today_ist()


@compiles(JSONB, "sqlite")
def _jsonb(element, compiler, **kw):
    return "JSON"


@pytest.fixture
def env():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine, tables=[Base.metadata.tables[t] for t in TABLES])
    db = sessionmaker(bind=engine, autoflush=False)()
    company = uuid.uuid4()
    db.add(Company(id=company, name="A & <b>Co</b>", subdomain="a"))
    depts = {n: uuid.uuid4() for n in ("Engineering", "Sales")}
    titles = {n: uuid.uuid4() for n in ("Junior", "Senior", "Peer", "Unranked", "Retired")}
    ids = {n: uuid.uuid4() for n in ("admin", "lead", "worker", "left", "fresh")}
    for n, i in depts.items():
        db.add(Department(id=i, company_id=company, name=n))
    for n, level in (("Junior", 1), ("Senior", 3), ("Peer", 1), ("Unranked", None), ("Retired", 5)):
        db.add(Designation(id=titles[n], company_id=company, title=n, level=level, is_active=n != "Retired"))
    for n, boss, title in (("admin", None, None), ("lead", "admin", "Senior"), ("worker", "lead", "Junior"),
                           ("left", "admin", None), ("fresh", "admin", None)):
        db.add(Employee(
            id=ids[n], company_id=company, full_name=n, employee_code=n, department_id=depts["Engineering"],
            manager_id=ids.get(boss), designation_id=titles.get(title), date_of_hire=date(2026, 1, 1),
            employment_status="inactive" if n == "left" else "active"))
    db.commit()

    def client(employee_id, perms=(), company_id=company):
        app = FastAPI()
        for r in (employee, job_change, designation, department, organization):
            app.include_router(r.router)
        merged = {p: True for p in perms}
        user = SimpleNamespace(employee_id=employee_id, merged_permissions=merged,
                               all_roles=[SimpleNamespace(name="x", permissions=merged)])
        app.dependency_overrides = {
            get_db: lambda: db, get_company_id: lambda: company_id, get_current_user: lambda: user}
        return TestClient(app)

    admin = client(ids["admin"], ["settings:write", "employees:write", "payroll:write"])

    def change(action, who="worker", by=admin, **fields):
        body = {"action": action, "effective_date": str(TODAY), **fields}
        return by.post(f"/api/employees/{ids[who]}/job-changes", json=body)

    yield SimpleNamespace(
        db=db, ids=ids, admin=admin, change=change, client=client,
        depts={n: str(i) for n, i in depts.items()}, titles={n: str(i) for n, i in titles.items()},
        emp=lambda n: db.query(Employee).filter(Employee.id == ids[n]).one())
    db.close()


def test_promote_updates_employee_and_history(env):
    res = env.change("promote", designation_id=env.titles["Senior"], reason="great year")
    assert res.status_code == 201
    assert res.json()["change_type"] == "promotion"
    assert str(env.emp("worker").designation_id) == env.titles["Senior"]
    row = env.admin.get(f"/api/employees/{env.ids['worker']}/job-changes").json()[0]
    assert (row["from_designation"], row["to_designation"], row["reason"]) == ("Junior", "Senior", "great year")
    assert row["actor_name"] == "admin"
    assert "promoted to Senior" in env.db.query(Notification).one().message


def test_demotion_needs_reason_and_is_masked_for_employee_and_hr(env):
    url = f"/api/employees/{env.ids['lead']}/job-changes"
    assert env.change("demote", "lead", designation_id=env.titles["Junior"], reason="  ").status_code == 400
    assert env.change("demote", "lead", designation_id=env.titles["Junior"], reason="private").status_code == 201
    assert env.admin.get(url).json()[0]["change_type"] == "demotion"
    for viewer in (env.client(env.ids["lead"]), env.client(env.ids["fresh"], ["employees:write"])):
        row = viewer.get(url).json()[0]
        assert row["change_type"] == "role_change"
        assert row["reason"] is row["actor_name"] is None
    assert "emot" not in env.db.query(Notification).one().message


@pytest.mark.parametrize("action,title", [
    ("promote", "Peer"), ("promote", "Unranked"), ("promote", "Retired"), ("promote", "Junior"),
    ("demote", "Senior"), ("transfer", "Senior")])
def test_wrong_level_is_refused(env, action, title):
    assert env.change(action, designation_id=env.titles[title], reason="r").status_code == 400
    assert env.db.query(EmployeeJobChange).count() == 0


def test_transfer_kinds(env):
    assert env.change("transfer", "fresh", designation_id=env.titles["Junior"]).json()["change_type"] == "assigned"
    assert env.change("transfer", designation_id=env.titles["Peer"]).json()["change_type"] == "role_change"
    assert env.change("transfer", department_id=env.depts["Sales"]).json()["change_type"] == "transfer"
    res = env.change("transfer", manager_id=None)
    assert (res.json()["change_type"], env.emp("worker").manager_id) == ("manager_change", None)
    assert env.change("transfer").status_code == 400


@pytest.mark.parametrize("who,boss", [("lead", "worker"), ("admin", "worker"), ("lead", "lead"), ("worker", "left")])
def test_bad_manager_is_refused(env, who, boss):
    assert env.change("transfer", who, manager_id=str(env.ids[boss])).status_code == 400


def test_not_before_hire_date(env):
    assert env.change("transfer", manager_id=None, effective_date="2025-12-31").status_code == 400


def test_cannot_backdate_before_last_change(env):
    env.change("transfer", department_id=env.depts["Sales"])
    assert env.change("transfer", manager_id=None, effective_date="2026-01-02").status_code == 400


def test_former_employee_and_department_head(env):
    assert env.change("transfer", "left", manager_id=None).status_code == 400
    env.db.query(Department).filter(Department.name == "Engineering").update({"head_id": env.ids["worker"]})
    env.db.commit()
    assert env.change("transfer", department_id=env.depts["Sales"]).status_code == 400


def test_access(env):
    hr = env.client(env.ids["fresh"], ["employees:write"])
    outsider = env.client(uuid.uuid4(), ["settings:write"], uuid.uuid4())
    assert env.change("transfer", by=hr, manager_id=None).status_code == 403
    assert env.change("transfer", by=outsider, manager_id=None).status_code == 404
    url = f"/api/employees/{env.ids['worker']}/job-changes"
    assert env.client(env.ids["fresh"], ["leave:approve"]).get(url).status_code == 403
    assert env.client(env.ids["worker"]).get(url).status_code == 200


def test_salary_revision_is_all_or_nothing(env):
    worker = env.ids["worker"]
    fields = {"designation_id": env.titles["Senior"], "salary": {"basic_pay": "50000"}}
    no_payroll = env.client(env.ids["admin"], ["settings:write"])
    assert env.change("promote", by=no_payroll, **fields).status_code == 403

    env.db.add(EmployeeSalaryAssignment(
        company_id=env.emp("worker").company_id, employee_id=worker, basic_pay=40000, effective_from=TODAY))
    env.db.commit()
    assert env.change("promote", **fields).status_code == 400
    assert str(env.emp("worker").designation_id) == env.titles["Junior"]
    assert env.db.query(EmployeeJobChange).count() == env.db.query(Notification).count() == 0

    env.db.query(EmployeeSalaryAssignment).update({"effective_from": TODAY - timedelta(days=30)})
    env.db.commit()
    res = env.change("promote", **fields)
    assert (res.status_code, res.json()["salary_revised"]) == (201, True)
    assert env.db.query(EmployeeSalaryAssignment).count() == 2


def test_profile_edit_cannot_bypass(env):
    url = f"/api/employees/{env.ids['worker']}"
    assert env.admin.put(url, json={"department_id": env.depts["Sales"]}).status_code == 400
    assert env.admin.put(url, json={"manager_id": str(env.ids["admin"])}).status_code == 400
    same = {"full_name": "renamed", "department_id": env.depts["Engineering"], "manager_id": None}
    assert env.admin.put(url, json=same).status_code == 200
    assert env.emp("worker").full_name == "renamed"


def test_designation_rules(env):
    worker = env.client(env.ids["worker"])
    assert worker.get("/api/designations/").status_code == 200
    assert worker.post("/api/designations/", json={"title": "Boss"}).status_code == 403
    assert env.admin.post("/api/designations/", json={"title": " junior "}).status_code == 400
    assert env.admin.post("/api/designations/", json={"title": "Boss", "level": 9}).json()["level"] == 9
    assert env.admin.delete(f"/api/designations/{env.titles['Junior']}").status_code == 409
    assert env.admin.delete(f"/api/designations/{env.titles['Peer']}").status_code == 204


def move(env, who, **to):
    e = env.emp(who)
    now = {"manager_id": str(e.manager_id) if e.manager_id else None, "department_id": str(e.department_id)}
    return {"employee_id": str(e.id), **now, **to, **{f"expected_{k}": v for k, v in now.items()}}


def publish(env, *moves, by=None):
    return (by or env.admin).post("/api/organization/publish", json={"moves": list(moves)})


def test_publish_moves_everyone_and_keeps_history(env):
    res = publish(env, move(env, "worker", manager_id=str(env.ids["admin"]), department_id=env.depts["Sales"]),
                  move(env, "fresh", manager_id=None))
    assert (res.status_code, res.json()) == (200, {"published": 2})
    assert env.emp("worker").manager_id == env.ids["admin"]
    assert sorted(c.change_type for c in env.db.query(EmployeeJobChange)) == ["manager_change", "transfer"]


def test_publish_allows_swap_but_not_loop(env):
    worker = str(env.ids["worker"])
    assert publish(env, move(env, "lead", manager_id=worker)).status_code == 400
    swap = (move(env, "lead", manager_id=worker), move(env, "worker", manager_id=str(env.ids["admin"])))
    assert publish(env, *swap).status_code == 200
    assert env.emp("lead").manager_id == env.ids["worker"]


def test_publish_is_all_or_nothing(env):
    res = publish(env, move(env, "fresh", manager_id=None), move(env, "worker", manager_id=str(env.ids["left"])))
    assert res.status_code == 400 and "worker" in res.json()["detail"]
    assert env.emp("fresh").manager_id == env.ids["admin"]
    assert env.db.query(EmployeeJobChange).count() == 0


def test_publish_refuses_stale_duplicate_and_empty(env):
    draft = move(env, "worker", manager_id=None)
    assert publish(env, draft, draft).status_code == 422
    assert publish(env).status_code == 422
    env.change("transfer", manager_id=str(env.ids["admin"]))
    assert publish(env, draft).status_code == 409
    assert env.emp("worker").manager_id == env.ids["admin"]


def test_org_editor_access(env):
    hr = env.client(env.ids["fresh"], ["employees:write"])
    outsider = env.client(uuid.uuid4(), ["settings:write"], uuid.uuid4())
    assert hr.get("/api/organization").status_code == 403
    assert publish(env, move(env, "worker", manager_id=None), by=hr).status_code == 403
    assert publish(env, move(env, "worker", manager_id=None), by=outsider).status_code == 409
    body = env.admin.get("/api/organization").json()
    assert {e["full_name"] for e in body["employees"]} == {"admin", "lead", "worker", "fresh"}
    assert {d["name"] for d in body["departments"]} == {"Engineering", "Sales"}


def test_department_writes_are_admin_only(env):
    hr, url = env.client(env.ids["fresh"], ["employees:write"]), f"/api/departments/{env.depts['Sales']}"
    assert hr.get("/api/departments/").status_code == 200
    assert hr.post("/api/departments/", json={"name": "X"}).status_code == 403
    assert hr.put(url, json={"name": "X"}).status_code == 403
    assert hr.delete(url).status_code == 403
    assert env.admin.put(url, json={"name": "X"}).status_code == 200


def test_org_chart_tree(env):
    top = env.admin.get("/api/employees/org-chart").json()
    assert [n["full_name"] for n in top] == ["admin"]
    lead = next(n for n in top[0]["direct_reports"] if n["full_name"] == "lead")
    assert [n["full_name"] for n in lead["direct_reports"]] == ["worker"]


TOMORROW = str(TODAY + timedelta(days=1))


def due(env, monkeypatch, days=1):
    """Run the background job as if it were `days` later."""
    later = lambda: TODAY + timedelta(days=days)  # noqa: E731
    monkeypatch.setattr(scheduled_job_change_service, "today_ist", later)
    monkeypatch.setattr("app.services.job_change_service.today_ist", later)
    return scheduled_job_change_service.apply_due(env.db)


def test_scheduled_change_waits_then_applies_once(env, monkeypatch):
    res = env.change("promote", designation_id=env.titles["Senior"], effective_date=TOMORROW, reason="r",
                     salary={"basic_pay": "50000.50"})
    assert (res.status_code, res.json()["scheduled"], res.json()["designation"]) == (201, True, "Senior")
    assert str(env.emp("worker").designation_id) == env.titles["Junior"]
    assert due(env, monkeypatch, 0) == 0
    assert due(env, monkeypatch) == 1
    assert due(env, monkeypatch) == 0
    assert str(env.emp("worker").designation_id) == env.titles["Senior"]
    change = env.db.query(EmployeeJobChange).one()
    assert (str(change.effective_date), change.reason) == (TOMORROW, "r")
    assert str(env.db.query(EmployeeSalaryAssignment).one().basic_pay) == "50000.50"


def test_schedule_is_validated_single_and_cancellable(env, monkeypatch):
    assert env.change("promote", designation_id=env.titles["Peer"], effective_date=TOMORROW).status_code == 400
    first = env.change("transfer", manager_id=None, effective_date=TOMORROW).json()
    assert env.change("transfer", manager_id=None, effective_date=TOMORROW).status_code == 400
    url = f"/api/employees/{env.ids['worker']}/job-changes/scheduled"
    assert len(env.admin.get(url).json()) == 1
    assert env.client(env.ids["worker"], ["employees:write"]).get(url).status_code == 403
    assert env.admin.delete(f"{url}/{first['id']}").status_code == 204
    assert env.admin.delete(f"{url}/{first['id']}").status_code == 404
    assert due(env, monkeypatch) == 0
    assert env.change("transfer", manager_id=None, effective_date=TOMORROW).status_code == 201


def test_failed_schedule_is_reported_and_does_not_stop_others(env, monkeypatch):
    env.change("transfer", manager_id=str(env.ids["fresh"]), effective_date=TOMORROW)
    env.change("transfer", "lead", manager_id=None, effective_date=TOMORROW)
    env.db.query(Employee).filter(Employee.full_name == "fresh").update({"employment_status": "inactive"})
    env.db.commit()
    assert due(env, monkeypatch) == 1
    assert env.emp("worker").manager_id == env.ids["lead"]
    assert env.emp("lead").manager_id is None
    row = env.admin.get(f"/api/employees/{env.ids['worker']}/job-changes/scheduled").json()[0]
    assert row["status"] == "failed" and "not an active" in row["error"]
    assert env.db.query(Notification).filter(Notification.recipient_employee_id == env.ids["admin"]).count() == 1
    assert {r.status for r in env.db.query(ScheduledJobChange)} == {"failed", "applied"}


def test_vacancies(env):
    url = "/api/organization/vacancies"
    body = {"title": " QA ", "department_id": env.depts["Sales"], "manager_id": str(env.ids["lead"])}
    assert env.client(env.ids["fresh"], ["employees:write"]).post(url, json=body).status_code == 403
    assert env.client(uuid.uuid4(), ["settings:write"], uuid.uuid4()).post(url, json=body).status_code == 400
    assert env.admin.post(url, json={**body, "title": "  "}).status_code == 400
    made = env.admin.post(url, json=body).json()["id"]
    job = JobOpening(company_id=env.emp("lead").company_id, title="QA job", status="Open")
    env.db.add(job)
    env.db.commit()
    assert env.admin.put(f"{url}/{made}", json={"job_id": str(uuid.uuid4())}).status_code == 400
    assert env.admin.put(f"{url}/{made}", json={"job_id": str(job.id)}).status_code == 200
    shown = env.admin.get("/api/organization").json()
    assert (shown["vacancies"][0]["title"], shown["vacancies"][0]["job_title"]) == ("QA", "QA job")
    assert shown["jobs"][0]["title"] == "QA job"
    assert env.admin.delete(f"{url}/{made}").status_code == 204
    assert env.admin.get("/api/organization").json()["vacancies"] == []


def test_department_head(env):
    url = f"/api/departments/{env.depts['Sales']}"
    assert env.admin.put(url, json={"head_id": str(env.ids["left"])}).status_code == 400
    assert env.admin.put(url, json={"head_id": str(env.ids["lead"])}).json()["head_name"] == "lead"
    assert env.admin.put(url, json={"head_id": None}).json()["head_id"] is None
    assert env.db.query(AuditLog).filter(AuditLog.action == "department.head_changed").count() == 2
