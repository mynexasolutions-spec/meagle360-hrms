"""Other employee documents: upload, view, delete and access."""

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies import get_current_user
from app.models.employee_document import EmployeeDocument
from app.routes import employee_document
from tests.test_required_documents import PDF, TABLES, env  # noqa: F401

TABLES.append("employee_document")


@pytest.fixture
def docs(env):  # noqa: F811
    """The same users, talking to the employee document routes."""
    for name in ("admin", "hr", "manager", "worker", "intern", "outsider"):
        old = getattr(env, name).app
        app = FastAPI()
        app.include_router(employee_document.router)
        app.dependency_overrides = old.dependency_overrides
        setattr(env, name, TestClient(app))
    env.url = f"/api/employees/{env.ids['worker']}/documents"
    env.company = env.db.query(employee_document.EmployeeDocumentService.__init__.__globals__["Employee"]).first().company_id
    return env


def send(client, url, file=PDF, name="Experience letter"):
    return client.post(url, data={"name": name}, files={"file": file})


def test_upload_view_delete(docs):
    assert send(docs.worker, docs.url).status_code == 204
    doc = docs.worker.get(docs.url).json()[0]
    assert (doc["name"], doc["filename"], doc["has_file"], doc["can_delete"]) == (
        "Experience letter", "pan.pdf", True, True)
    got = docs.worker.get(f"{docs.url}/{doc['id']}/file")
    assert got.content == PDF[1] and got.headers["cache-control"] == "private, no-store"
    assert docs.worker.delete(f"{docs.url}/{doc['id']}").status_code == 204
    assert docs.worker.get(docs.url).json() == [] and docs.storage.files == {}


def test_access(docs):
    send(docs.worker, docs.url)
    one = f"{docs.url}/{docs.worker.get(docs.url).json()[0]['id']}"
    for other, code in ((docs.intern, 403), (docs.manager, 403), (docs.outsider, 404)):
        assert other.get(docs.url).status_code == code
        assert other.get(f"{one}/file").status_code == code
        assert other.delete(one).status_code == code
        assert send(other, docs.url).status_code == code
    # Another employee's id in the path does not open the file.
    mine = f"/api/employees/{docs.ids['intern']}/documents/{one.rsplit('/', 1)[1]}"
    assert docs.intern.get(f"{mine}/file").status_code == 404
    assert docs.intern.delete(mine).status_code == 404
    assert len(docs.storage.files) == 1


def test_only_hr_deletes_what_hr_uploaded(docs):
    send(docs.hr, docs.url)
    doc = docs.worker.get(docs.url).json()[0]
    assert not doc["can_delete"]
    assert docs.worker.delete(f"{docs.url}/{doc['id']}").status_code == 403
    assert docs.hr.delete(f"{docs.url}/{doc['id']}").status_code == 204


def test_bad_input_and_storage_failure(docs):
    assert send(docs.worker, docs.url, ("a.pdf", b"<html>", "application/pdf")).status_code == 400
    assert send(docs.worker, docs.url, name="  ").status_code == 400
    assert docs.worker.post(docs.url, json={"doc_type": "x", "file_url": "https://x.y"}).status_code == 422
    docs.storage.down = True
    assert send(docs.worker, docs.url).status_code == 502
    assert docs.worker.get(docs.url).json() == []


@pytest.mark.parametrize("url, shown", [("https://drive.google.com/x", True), ("javascript:alert(1)", False),
                                        ("/resumes/x.pdf", False)])
def test_old_links(docs, url, shown):
    old = EmployeeDocument(id=uuid.uuid4(), company_id=docs.company, employee_id=docs.ids["worker"],
                           doc_type="Old", file_url=url, e_signed=False)
    docs.db.add(old)
    docs.db.commit()
    doc = docs.worker.get(docs.url).json()[0]
    assert doc["link"] == (url if shown else None) and not doc["can_delete"]
    assert docs.worker.get(f"{docs.url}/{doc['id']}/file").status_code == 404
    assert docs.hr.delete(f"{docs.url}/{doc['id']}").status_code == 204
