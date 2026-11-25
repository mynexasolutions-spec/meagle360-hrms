"""Company policies: publishing, agreeing, versions and access."""

import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.dependencies import get_company_id, get_current_user
from app.models import Base
from app.models.employee import Employee
from app.routes import policy
from app.services.policy_service import PolicyService
from app.services.policy_templates import TEMPLATES

# Tests marked "defaults" start with the starter policies; the rest start empty.
TABLES = ["employee", "audit_log", "company_policy", "company_policy_version",
          "company_policy_file", "company_policy_ack"]
PDF = ("rules.pdf", b"%PDF-1.4 test", "application/pdf")


@compiles(JSONB, "sqlite")
def _jsonb(element, compiler, **kw):
    return "JSON"


@pytest.fixture
def env(request, monkeypatch):
    if not request.node.get_closest_marker("defaults"):
        monkeypatch.setattr(PolicyService, "ensure_defaults", lambda self: None)
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine, tables=[Base.metadata.tables[t] for t in TABLES])
    db = sessionmaker(bind=engine)()
    company, admin, worker = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    for i, e in enumerate((admin, worker)):
        db.add(Employee(id=e, company_id=company, full_name=f"P{i}", employee_code=f"E{i}",
                        date_of_hire=date(2026, 1, 1), employment_status="active"))
    db.commit()

    def client(employee_id, is_admin=False, company_id=company):
        app = FastAPI()
        app.include_router(policy.router)
        perms = {"settings:write": True} if is_admin else {}
        role = SimpleNamespace(name="x", permissions=perms)
        user = SimpleNamespace(employee_id=employee_id, merged_permissions=perms, all_roles=[role])
        app.dependency_overrides = {
            get_db: lambda: db, get_company_id: lambda: company_id, get_current_user: lambda: user}
        return TestClient(app)

    yield SimpleNamespace(admin=client(admin, True), worker=client(worker),
                          outsider=client(uuid.uuid4(), True, uuid.uuid4()))
    db.close()


def make(env, **extra):
    data = {"title": "Rules", "body": "Be kind", "requires_ack": True, **extra}
    return env.admin.post("/api/policies/manage", json=data).json()["id"]


def publish(env, pid, ask_again=True):
    return env.admin.post(f"/api/policies/manage/{pid}/publish", json={"ask_again": ask_again})


def edit(env, pid, body):
    return env.admin.put(f"/api/policies/manage/{pid}", json={"title": "Rules", "body": body, "requires_ack": True})


def agree(env, pid, version):
    return env.worker.post(f"/api/policies/{pid}/acknowledge", json={"version": version})


def pending(env):
    return env.worker.get("/api/policies/pending-count").json()["count"]


@pytest.mark.defaults
def test_defaults_are_published_once_for_everyone(env):
    assert len(env.worker.get("/api/policies/").json()) == len(TEMPLATES)
    rows = env.admin.get("/api/policies/manage").json()
    assert len(rows) == len(TEMPLATES)
    assert {r["status"] for r in rows} == {"published"}
    assert pending(env) == sum(t["requires_ack"] for t in TEMPLATES)


def test_default_text_has_no_blanks():
    assert not any("[" in t["body"] for t in TEMPLATES)


def test_employee_sees_the_published_text_not_the_edit(env):
    pid = make(env)
    publish(env, pid)
    edit(env, pid, "Draft change")
    assert env.worker.get("/api/policies/").json()[0]["body"] == "Be kind"
    publish(env, pid)
    assert env.worker.get("/api/policies/").json()[0]["body"] == "Draft change"


def test_agree_then_ask_again_or_not(env):
    pid = make(env)
    publish(env, pid)
    assert pending(env) == 1
    assert agree(env, pid, 1).status_code == 204
    assert agree(env, pid, 1).status_code == 204  # repeat is harmless
    assert pending(env) == 0
    edit(env, pid, "typo fix")
    publish(env, pid, ask_again=False)
    assert pending(env) == 0
    edit(env, pid, "big change")
    publish(env, pid, ask_again=True)
    assert pending(env) == 1


def test_cannot_agree_to_an_old_version(env):
    pid = make(env)
    publish(env, pid)
    edit(env, pid, "new")
    publish(env, pid)
    assert agree(env, pid, 1).status_code == 409


def test_report_and_counts(env):
    pid = make(env)
    publish(env, pid)
    agree(env, pid, 1)
    report = env.admin.get(f"/api/policies/manage/{pid}/report").json()
    assert sorted((r["employee_name"], r["agreed"]) for r in report) == [("P0", False), ("P1", True)]
    row = next(r for r in env.admin.get("/api/policies/manage").json() if r["id"] == pid)
    assert (row["agreed_count"], row["employee_count"]) == (1, 2)


def test_hide_and_show(env):
    pid = make(env)
    publish(env, pid)
    env.admin.post(f"/api/policies/manage/{pid}/visibility", json={"hidden": True})
    assert env.worker.get("/api/policies/").json() == [] and pending(env) == 0
    env.admin.post(f"/api/policies/manage/{pid}/visibility", json={"hidden": False})
    assert len(env.worker.get("/api/policies/").json()) == 1


def test_publish_rules(env):
    assert publish(env, make(env, body="  ")).status_code == 400
    pid = make(env)
    assert publish(env, pid).status_code == 200
    assert publish(env, pid).status_code == 400  # nothing changed


@pytest.mark.defaults
def test_admin_can_delete_any_policy_for_good(env):
    for row in env.admin.get("/api/policies/manage").json():
        assert env.worker.delete(f"/api/policies/manage/{row['id']}").status_code == 403
        assert env.admin.delete(f"/api/policies/manage/{row['id']}").status_code == 204
    assert env.admin.get("/api/policies/manage").json() == []
    assert env.worker.get("/api/policies/").json() == [] and pending(env) == 0
    assert agree(env, row["id"], 1).status_code == 404


@pytest.mark.defaults
def test_reset_restores_the_working_copy_only(env):
    row = env.admin.get("/api/policies/manage").json()[0]
    edit(env, row["id"], "ours")
    publish(env, row["id"])
    assert env.admin.post(f"/api/policies/manage/{row['id']}/reset").json()["body"] == row["body"]
    seen = {p["id"]: p["body"] for p in env.worker.get("/api/policies/").json()}
    assert seen[row["id"]] == "ours"


@pytest.mark.defaults
def test_reorder(env):
    ids = [r["id"] for r in env.admin.get("/api/policies/manage").json()][::-1]
    assert env.admin.put("/api/policies/manage/order", json={"ids": ids}).status_code == 204
    assert [r["id"] for r in env.admin.get("/api/policies/manage").json()] == ids
    assert env.admin.put("/api/policies/manage/order", json={"ids": ids[1:]}).status_code == 409


def test_pdf_is_private_until_published(env):
    pid = make(env)
    publish(env, pid)
    url = f"/api/policies/manage/{pid}/attachment"
    assert env.admin.post(url, files={"file": ("x.pdf", b"not a pdf", "application/pdf")}).status_code == 400
    assert env.admin.post(url, files={"file": PDF}).json()["attachment_name"] == "rules.pdf"
    assert env.worker.get(f"/api/policies/{pid}/attachment").status_code == 404
    publish(env, pid)
    assert env.worker.get(f"/api/policies/{pid}/attachment").content == PDF[1]
    env.admin.delete(url)
    assert env.worker.get(f"/api/policies/{pid}/attachment").content == PDF[1]


def test_access(env):
    pid = make(env)
    publish(env, pid)
    assert env.worker.get("/api/policies/manage").status_code == 403
    assert env.worker.post("/api/policies/manage", json={"title": "x"}).status_code == 403
    assert env.worker.get(f"/api/policies/manage/{pid}/attachment").status_code == 403
    # another company's admin
    assert env.outsider.get("/api/policies/").json() == []
    assert publish(SimpleNamespace(admin=env.outsider), pid).status_code == 404
    assert env.outsider.get(f"/api/policies/manage/{pid}/report").status_code == 404
