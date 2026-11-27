"""Required documents: who owes what, uploads, review and access."""

import uuid
from datetime import date
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
from app.models.department import Department
from app.models.employee import Employee
from app.routes import ats, required_document
from app.services import document_storage

TABLES = ["employee", "department", "audit_log", "required_document", "required_document_file"]
PDF = ("pan.pdf", b"%PDF-1.4 test", "application/pdf")
PNG = ("pan.png", b"\x89PNG\r\n\x1a\n123", "image/png")
URL = "/api/documents"


@compiles(JSONB, "sqlite")
def _jsonb(element, compiler, **kw):
    return "JSON"


class FakeStorage:
    def __init__(self):
        self.files, self.down = {}, False

    def save(self, company_id, employee_id, content, content_type):
        if self.down:
            raise document_storage.StorageError("down")
        key = uuid.uuid4().hex
        self.files[key] = content
        return key, key

    def load(self, path):
        if self.down:
            raise document_storage.StorageError("down")
        return self.files[path]

    def remove(self, file_id):
        del self.files[file_id]


@pytest.fixture
def env(monkeypatch):
    storage = FakeStorage()
    for name in ("save", "load", "remove"):
        monkeypatch.setattr(document_storage, name, getattr(storage, name))
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine, tables=[Base.metadata.tables[t] for t in TABLES])
    db = sessionmaker(bind=engine)()
    company, eng, sales = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    for d, name in ((eng, "Engineering"), (sales, "Sales")):
        db.add(Department(id=d, company_id=company, name=name))
    ids = {}
    for name, dept, kind in (("admin", eng, "full_time"), ("worker", eng, "full_time"), ("intern", sales, "intern")):
        ids[name] = uuid.uuid4()
        db.add(Employee(id=ids[name], company_id=company, full_name=name, employee_code=name, department_id=dept,
                        employment_type=kind, date_of_hire=date(2026, 1, 1), employment_status="active"))
    db.commit()

    def client(employee_id, perms=(), company_id=company):
        app = FastAPI()
        app.include_router(required_document.router)
        merged = {p: True for p in perms}
        role = SimpleNamespace(name="x", permissions=merged)
        user = SimpleNamespace(employee_id=employee_id, merged_permissions=merged, all_roles=[role])
        app.dependency_overrides = {
            get_db: lambda: db, get_company_id: lambda: company_id, get_current_user: lambda: user}
        return TestClient(app)

    yield SimpleNamespace(
        ids=ids, eng=str(eng), sales=str(sales), db=db, storage=storage,
        admin=client(ids["admin"], ["settings:write", "employees:write"]),
        hr=client(ids["admin"], ["employees:write"]),
        manager=client(ids["admin"], ["leave:approve", "employees:read"]),
        worker=client(ids["worker"]), intern=client(ids["intern"]),
        outsider=client(uuid.uuid4(), ["settings:write", "employees:write"], uuid.uuid4()))
    db.close()


def make(env, name="PAN Card", **extra):
    res = env.admin.post(f"{URL}/required", json={"name": name, **extra})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def items(client, employee_id):
    return {i["name"]: i for i in client.get(f"{URL}/employees/{employee_id}").json()}


def send(client, employee_id, doc, file=PDF):
    return client.post(f"{URL}/employees/{employee_id}/{doc}", files={"file": file})


def review(client, file_id, decision="verified", note=""):
    return client.post(f"{URL}/files/{file_id}/review", json={"decision": decision, "note": note})


def pending(client):
    return client.get(f"{URL}/pending-count").json()["count"]


def test_documents_apply_by_department_and_employment_type(env):
    make(env, "All")
    make(env, "Eng", department_ids=[env.eng])
    make(env, "Intern", employment_types=["intern"])
    make(env, "Both", department_ids=[env.eng], employment_types=["intern"])
    assert set(items(env.worker, env.ids["worker"])) == {"All", "Eng"}
    assert set(items(env.intern, env.ids["intern"])) == {"All", "Intern"}
    rows = {r["name"]: r for r in env.admin.get(f"{URL}/overview").json()["employees"]}
    assert len(rows["worker"]["statuses"]) == 2 and rows["worker"]["missing"] == 2


def test_upload_reject_upload_verify(env):
    me, doc = env.ids["worker"], make(env)
    assert pending(env.worker) == 1
    assert send(env.worker, me, doc).status_code == 204
    first = items(env.worker, me)["PAN Card"]
    assert first["status"] == "uploaded" and pending(env.worker) == 0

    assert review(env.hr, first["file"]["id"], "rejected").status_code == 400
    assert review(env.hr, first["file"]["id"], "rejected", "Blurred").status_code == 204
    rejected = items(env.worker, me)["PAN Card"]
    assert (rejected["status"], rejected["file"]["review_note"]) == ("rejected", "Blurred")
    assert pending(env.worker) == 1

    assert send(env.worker, me, doc, PNG).status_code == 204
    second = items(env.worker, me)["PAN Card"]["file"]["id"]
    # A review of the replaced file must not touch the new one.
    assert review(env.hr, first["file"]["id"]).status_code == 404
    assert review(env.hr, second).status_code == 204
    assert items(env.worker, me)["PAN Card"]["status"] == "verified"
    assert send(env.worker, me, doc).status_code == 409
    assert send(env.hr, me, doc).status_code == 204


def test_access(env):
    me, doc = env.ids["worker"], make(env)
    send(env.worker, me, doc)
    file_id = items(env.worker, me)["PAN Card"]["file"]["id"]
    got = env.worker.get(f"{URL}/files/{file_id}")
    assert got.content == PDF[1] and got.headers["cache-control"] == "private, no-store"
    assert env.hr.get(f"{URL}/files/{file_id}").status_code == 200
    for other in (env.intern, env.manager):
        assert other.get(f"{URL}/files/{file_id}").status_code == 403
        assert other.get(f"{URL}/employees/{me}").status_code == 403
        assert send(other, me, doc).status_code == 403
        assert review(other, file_id).status_code == 403
        assert other.get(f"{URL}/overview").status_code == 403
    assert review(env.worker, file_id).status_code == 403
    assert env.outsider.get(f"{URL}/files/{file_id}").status_code == 404
    assert env.outsider.get(f"{URL}/employees/{me}").status_code == 404
    assert review(env.outsider, file_id).status_code == 404
    assert send(env.outsider, me, doc).status_code == 404
    assert env.outsider.get(f"{URL}/overview").json() == {"documents": [], "employees": []}
    # HR reviews, but only an admin changes the list.
    assert env.hr.post(f"{URL}/required", json={"name": "X"}).status_code == 403


@pytest.mark.parametrize("content", [b"", b"<html>", b"MZ123", b"%PDF-" + b"0" * (2 * 1024 * 1024)],
                         ids=["empty", "html", "exe", "too-big"])
def test_bad_files(env, content):
    res = send(env.worker, env.ids["worker"], make(env), ("a.pdf", content, "application/pdf"))
    assert res.status_code == 400


def test_cannot_upload_what_is_not_required(env):
    doc = make(env, department_ids=[env.sales])
    assert send(env.worker, env.ids["worker"], doc).status_code == 400


def test_archive_keeps_the_file(env):
    me, doc = env.ids["worker"], make(env)
    send(env.worker, me, doc)
    env.admin.post(f"{URL}/required/{doc}/archive", json={"archived": True})
    item = items(env.worker, me)["PAN Card"]
    assert not item["required"] and item["file"]
    assert items(env.intern, env.ids["intern"]) == {}
    assert env.admin.get(f"{URL}/overview").json()["documents"] == []
    make(env)  # the name is free again
    assert env.admin.post(f"{URL}/required/{doc}/archive", json={"archived": False}).status_code == 409


def test_list_rules(env):
    doc = make(env)
    assert env.admin.post(f"{URL}/required", json={"name": "pan card"}).status_code == 409
    assert env.admin.post(f"{URL}/required", json={"name": "  "}).status_code == 422
    assert env.admin.post(f"{URL}/required", json={"name": "B", "employment_types": ["boss"]}).status_code == 422
    assert env.admin.post(f"{URL}/required", json={"name": "B", "department_ids": [str(uuid.uuid4())]}).status_code == 400
    assert env.admin.put(f"{URL}/required/{doc}", json={"name": "PAN", "mandatory": False}).status_code == 200
    assert env.outsider.put(f"{URL}/required/{doc}", json={"name": "Z"}).status_code == 404
    assert pending(env.worker) == 0  # optional documents are not counted


def test_replacing_removes_the_old_file(env):
    me, doc = env.ids["worker"], make(env)
    send(env.worker, me, doc)
    send(env.worker, me, doc, PNG)
    assert list(env.storage.files.values()) == [PNG[1]]


def test_storage_failure_is_reported_and_loses_nothing(env):
    me, doc = env.ids["worker"], make(env)
    env.storage.down = True
    assert send(env.worker, me, doc).status_code == 502
    assert items(env.worker, me)["PAN Card"]["status"] == "pending"
    env.storage.down = False
    send(env.worker, me, doc)
    file_id = items(env.worker, me)["PAN Card"]["file"]["id"]
    env.storage.down = True
    assert send(env.worker, me, doc, PNG).status_code == 502
    assert env.worker.get(f"{URL}/files/{file_id}").status_code == 502
    env.storage.down = False
    assert env.worker.get(f"{URL}/files/{file_id}").content == PDF[1]


def test_failed_save_removes_the_new_file(env, monkeypatch):
    doc = make(env)

    def broken():
        raise RuntimeError("database down")

    monkeypatch.setattr(env.db, "commit", broken)
    with pytest.raises(RuntimeError):
        send(env.worker, env.ids["worker"], doc)
    assert env.storage.files == {}


def test_no_route_serves_files_by_path():
    assert not any("resume-file" in r.path for r in ats.router.routes)
