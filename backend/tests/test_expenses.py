"""Expenses: receipt uploads (private ImageKit) and org-admin categories."""

import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.dependencies import get_company_id, get_current_user
from app.models import Base
from app.models.department import Department
from app.models.employee import Employee
from app.routes import expense
from app.services import document_storage
from tests.test_required_documents import PDF  # noqa: F401  (also registers the JSONB→JSON shim)

TABLES = ["employee", "department", "audit_log", "expense_category", "expense_claim"]
URL = "/api/expenses"


class FakeStorage:
    def __init__(self):
        self.files, self.folders, self.down = {}, {}, False

    def save(self, company_id, employee_id, content, content_type, subfolder=None):
        if self.down:
            raise document_storage.StorageError("down")
        key = uuid.uuid4().hex
        self.files[key], self.folders[key] = content, subfolder
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
    company, dept = uuid.uuid4(), uuid.uuid4()
    db.add(Department(id=dept, company_id=company, name="Eng"))
    ids = {}
    for name in ("admin", "approver", "worker", "other"):
        ids[name] = uuid.uuid4()
        db.add(Employee(id=ids[name], company_id=company, full_name=name, employee_code=name, department_id=dept,
                        employment_type="full_time", date_of_hire=date(2026, 1, 1), employment_status="active"))
    db.commit()

    def client(employee_id, perms, company_id=company):
        app = FastAPI()
        app.include_router(expense.router)
        merged = {p: True for p in perms}
        user = SimpleNamespace(employee_id=employee_id, merged_permissions=merged,
                               all_roles=[SimpleNamespace(name="x", permissions=merged)])
        app.dependency_overrides = {
            get_db: lambda: db, get_company_id: lambda: company_id, get_current_user: lambda: user}
        return TestClient(app)

    employee = ["expenses:write"]
    yield SimpleNamespace(
        db=db, storage=storage, ids=ids,
        admin=client(ids["admin"], ["settings:write", *employee]),
        approver=client(ids["approver"], ["expenses:approve", *employee]),
        worker=client(ids["worker"], employee),
        other=client(ids["other"], employee),
        outsider=client(uuid.uuid4(), ["settings:write", "expenses:approve", *employee], uuid.uuid4()),
    )
    db.close()


def submit(client, file=PDF, **fields):
    data = {"amount": "250.50", "expense_date": "2026-11-20", "description": "Cab", **fields}
    return client.post(f"{URL}/claims", data=data, files={"receipt": file} if file else None)


def test_receipt_upload_and_view(env):
    res = submit(env.worker)
    assert res.status_code == 201, res.text
    claim = res.json()
    assert claim["has_receipt"] and claim["receipt_filename"] == "pan.pdf" and claim["receipt_url"] is None
    assert list(env.storage.folders.values()) == ["receipts"]
    for who in (env.worker, env.approver):
        got = who.get(f"{URL}/claims/{claim['id']}/receipt")
        assert got.status_code == 200 and got.content == PDF[1]
        assert got.headers["content-type"] == "application/pdf"
        assert got.headers["cache-control"] == "private, no-store"
    # Another employee, or another company, cannot open it.
    assert env.other.get(f"{URL}/claims/{claim['id']}/receipt").status_code == 404
    assert env.outsider.get(f"{URL}/claims/{claim['id']}/receipt").status_code == 404


def test_claim_without_receipt(env):
    res = submit(env.worker, file=None)
    assert res.status_code == 201 and not res.json()["has_receipt"]
    assert env.worker.get(f"{URL}/claims/{res.json()['id']}/receipt").status_code == 404
    assert env.storage.files == {}


def test_bad_receipts_and_storage_failure(env):
    assert submit(env.worker, file=("a.pdf", b"<html>", "application/pdf")).status_code == 400
    assert submit(env.worker, file=("a.pdf", b"%PDF-" + b"0" * (2 * 1024 * 1024), "application/pdf")).status_code == 400
    assert submit(env.worker, amount="0").status_code == 400
    env.storage.down = True
    assert submit(env.worker).status_code == 502
    assert env.worker.get(f"{URL}/my-claims").json() == []


def test_failed_save_removes_the_upload(env, monkeypatch):
    def broken():
        raise RuntimeError("db down")
    monkeypatch.setattr(env.db, "commit", broken)
    with pytest.raises(RuntimeError):
        submit(env.worker)
    assert env.storage.files == {}


def test_categories_are_org_admin_only(env):
    assert env.approver.post(f"{URL}/categories", json={"name": "Travel"}).status_code == 403
    assert env.worker.get(f"{URL}/categories?include_inactive=true").status_code == 403
    res = env.admin.post(f"{URL}/categories", json={"name": "Travel"})
    assert res.status_code == 201 and res.json()["is_active"]
    cat = res.json()["id"]
    assert env.approver.patch(f"{URL}/categories/{cat}", json={"name": "X"}).status_code == 403
    assert env.outsider.patch(f"{URL}/categories/{cat}", json={"name": "X"}).status_code == 404


def test_rename_deactivate_and_duplicates(env):
    cat = env.admin.post(f"{URL}/categories", json={"name": "Travel"}).json()["id"]
    env.admin.post(f"{URL}/categories", json={"name": "Food"})
    assert env.admin.post(f"{URL}/categories", json={"name": " travel "}).status_code == 409
    assert env.admin.patch(f"{URL}/categories/{cat}", json={"name": "FOOD"}).status_code == 409
    assert env.admin.patch(f"{URL}/categories/{cat}", json={"name": "Cab & Travel"}).json()["name"] == "Cab & Travel"

    claim = submit(env.worker, category_id=cat).json()
    assert env.admin.patch(f"{URL}/categories/{cat}", json={"is_active": False}).status_code == 200
    # Hidden from the form and refused on new claims, but old claims keep the name.
    assert [c["name"] for c in env.worker.get(f"{URL}/categories").json()] == ["Food"]
    assert len(env.admin.get(f"{URL}/categories?include_inactive=true").json()) == 2
    assert submit(env.worker, category_id=cat).status_code == 400
    assert env.worker.get(f"{URL}/my-claims").json()[0]["category_name"] == "Cab & Travel"
    assert claim["category_id"] == cat


def test_other_companys_category_is_refused(env):
    theirs = env.outsider.post(f"{URL}/categories", json={"name": "Travel"}).json()["id"]
    assert submit(env.worker, category_id=theirs).status_code == 400
