"""PAN / bank details: employee asks, HR approves; payslips keep what they were paid with."""

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
from app.models.notification import Notification
from app.routes import bank_details
from app.services import bank_details_service, document_storage
from app.services.bank_details_service import payslip_bank_details, snapshot_payslip
from app.services.geofence_service import GeofenceService
from tests.test_expenses import FakeStorage
from tests.test_required_documents import PDF  # noqa: F401  (registers the JSONB shim)

TABLES = ["employee", "department", "audit_log", "notification", "bank_detail_request"]
URL = "/api/bank-details"
GOOD = {"pan_number": "abcde1234f", "bank_account_number": "1234 5678 9012",
        "bank_ifsc": "sbin0000300", "bank_name": "State Bank of India"}


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
    for name in ("hr", "worker", "other"):
        ids[name] = uuid.uuid4()
        db.add(Employee(id=ids[name], company_id=company, full_name=name, employee_code=name, department_id=dept,
                        employment_type="full_time", date_of_hire=date(2026, 1, 1), employment_status="active"))
    db.commit()
    monkeypatch.setattr(GeofenceService, "_reviewer_ids", lambda self: [ids["hr"]])

    def client(employee_id, perms=(), company_id=company):
        app = FastAPI()
        app.include_router(bank_details.router)
        merged = {p: True for p in perms}
        user = SimpleNamespace(employee_id=employee_id, merged_permissions=merged,
                               all_roles=[SimpleNamespace(name="x", permissions=merged)])
        app.dependency_overrides = {
            get_db: lambda: db, get_company_id: lambda: company_id, get_current_user: lambda: user}
        return TestClient(app)

    yield SimpleNamespace(
        db=db, ids=ids, storage=storage,
        hr=client(ids["hr"], ["employees:write"]), worker=client(ids["worker"]), other=client(ids["other"]),
        outsider=client(uuid.uuid4(), ["employees:write"], uuid.uuid4()))
    db.close()


def ask(client, file=PDF, **fields):
    return client.post(f"{URL}/me/requests", data={**GOOD, **fields}, files={"proof": file} if file else None)


def worker(env):
    env.db.expire_all()
    return env.db.get(Employee, env.ids["worker"])


def test_request_then_approve_updates_the_employee(env):
    res = ask(env.worker)
    assert res.status_code == 201, res.text
    req = res.json()
    # Normalised, and the employee only ever sees the masked number back.
    assert (req["pan_number"], req["bank_ifsc"], req["bank_account_number"], req["bank_account_masked"]) == (
        "ABCDE1234F", "SBIN0000300", None, "**** **** 9012")
    assert worker(env).bank_account_number is None  # nothing changes until HR approves
    assert env.db.query(Notification).filter_by(recipient_employee_id=env.ids["hr"]).count() == 1

    queue = env.hr.get(f"{URL}/requests").json()
    assert [(q["employee_name"], q["bank_account_number"]) for q in queue] == [("worker", "123456789012")]
    assert env.hr.get(f"{URL}/requests/{req['id']}/proof").content == PDF[1]

    assert env.hr.post(f"{URL}/requests/{req['id']}/review", json={"decision": "approved"}).status_code == 200
    emp = worker(env)
    assert (emp.pan_number, emp.bank_account_number, emp.bank_ifsc, emp.bank_name) == (
        "ABCDE1234F", "123456789012", "SBIN0000300", "State Bank of India")
    me = env.worker.get(f"{URL}/me").json()
    assert me["current"]["bank_account_masked"] == "**** **** 9012"
    assert me["latest_request"]["status"] == "approved"
    assert env.db.query(Notification).filter_by(recipient_employee_id=env.ids["worker"]).count() == 1


def test_reject_needs_a_reason_and_changes_nothing(env):
    req = ask(env.worker, file=None).json()
    url = f"{URL}/requests/{req['id']}/review"
    assert env.hr.post(url, json={"decision": "rejected"}).status_code == 400
    assert env.hr.post(url, json={"decision": "rejected", "note": "Cheque name differs"}).status_code == 200
    assert worker(env).pan_number is None
    assert env.worker.get(f"{URL}/me").json()["latest_request"]["review_note"] == "Cheque name differs"
    assert env.hr.post(url, json={"decision": "approved"}).status_code == 400  # already decided


@pytest.mark.parametrize("fields, message", [
    ({"pan_number": "ABCD1234F"}, "PAN"),
    ({"bank_ifsc": "SBIN1000300"}, "IFSC"),
    ({"bank_account_number": "12ab45678"}, "Account"),
    ({"bank_name": ""}, "together"),
])
def test_bad_input(env, fields, message):
    res = ask(env.worker, **fields)
    assert res.status_code == 400 and message in res.json()["detail"]
    assert env.storage.files == {}


def test_pan_only_change_leaves_bank_alone(env):
    req = env.worker.post(f"{URL}/me/requests", data={"pan_number": "ABCDE1234F"}).json()
    env.hr.post(f"{URL}/requests/{req['id']}/review", json={"decision": "approved"})
    emp = worker(env)
    assert emp.pan_number == "ABCDE1234F" and emp.bank_account_number is None


def test_one_pending_at_a_time_and_cancel(env):
    req = ask(env.worker).json()
    assert ask(env.worker).status_code == 409
    assert env.other.delete(f"{URL}/me/requests/{req['id']}").status_code == 404
    assert env.worker.delete(f"{URL}/me/requests/{req['id']}").status_code == 204
    assert env.storage.files == {}  # the proof goes with it
    assert ask(env.worker).status_code == 201


def test_no_change_is_refused(env):
    req = ask(env.worker, file=None).json()
    env.hr.post(f"{URL}/requests/{req['id']}/review", json={"decision": "approved"})
    assert ask(env.worker, file=None).status_code == 400


def test_access(env):
    req = ask(env.worker).json()
    assert env.worker.get(f"{URL}/requests").status_code == 403
    assert env.worker.post(f"{URL}/requests/{req['id']}/review", json={"decision": "approved"}).status_code == 403
    assert env.other.get(f"{URL}/requests/{req['id']}/proof").status_code == 404
    assert env.worker.get(f"{URL}/requests/{req['id']}/proof").status_code == 200
    assert env.outsider.get(f"{URL}/requests").json() == []
    assert env.outsider.post(f"{URL}/requests/{req['id']}/review", json={"decision": "approved"}).status_code == 404


def test_nobody_approves_their_own_change(env):
    req = ask(env.hr).json()
    assert env.hr.post(f"{URL}/requests/{req['id']}/review", json={"decision": "approved"}).status_code == 403


def test_ifsc_lookup(env, monkeypatch):
    monkeypatch.setattr(bank_details_service, "lookup_ifsc", lambda code: {"bank": "X"})
    monkeypatch.setattr(bank_details, "lookup_ifsc", bank_details_service.lookup_ifsc)
    assert env.worker.get(f"{URL}/ifsc/SBIN0000300").json() == {"bank": "X"}


def test_ifsc_format_is_checked_before_calling_out():
    with pytest.raises(ValueError):
        bank_details_service.lookup_ifsc("SBIN")


def test_payslip_keeps_the_details_it_was_paid_with():
    emp = SimpleNamespace(pan_number="OLDPN1234A", bank_account_number="111", bank_ifsc="A", bank_name="Old")
    draft = SimpleNamespace(payroll_run=SimpleNamespace(status="draft"), employee=emp,
                            pan_number=None, bank_account_number=None, bank_ifsc=None, bank_name=None)
    assert payslip_bank_details(draft)["bank_name"] == "Old"  # drafts follow the employee
    final = SimpleNamespace(payroll_run=SimpleNamespace(status="finalized"), employee=emp)
    snapshot_payslip(final, emp)
    emp.bank_name, emp.bank_account_number = "New", "222"
    assert payslip_bank_details(final)["bank_name"] == "Old"
    assert payslip_bank_details(final)["bank_account_number"] == "111"
