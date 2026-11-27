"""Which documents each employee owes, what they uploaded, and HR's review."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.models.department import Department
from app.models.employee import Employee
from app.models.required_document import RequiredDocument, RequiredDocumentFile
from app.services import document_storage
from app.services.audit_service import log_action

MAX_FILE_BYTES = 2 * 1024 * 1024


class DocumentConflict(Exception):
    pass


def detect_type(content: bytes) -> str:
    """The real type, from the content rather than the file name."""
    if not content:
        raise ValueError("The file is empty.")
    if len(content) > MAX_FILE_BYTES:
        raise ValueError("The file is larger than 2 MB.")
    if content.startswith(b"%PDF-"):
        return "application/pdf"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    raise ValueError("Only PDF, JPG and PNG files are accepted.")


def applies_to(doc: RequiredDocument, employee: Employee) -> bool:
    if doc.department_ids and str(employee.department_id) not in doc.department_ids:
        return False
    return not doc.employment_types or employee.employment_type in doc.employment_types


class RequiredDocumentService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    # ── Lookups ──────────────────────────────────────────
    def _docs(self, archived: bool | None = False) -> list[RequiredDocument]:
        q = self.db.query(RequiredDocument).filter(RequiredDocument.company_id == self.company_id)
        if archived is not None:
            q = q.filter(RequiredDocument.archived.is_(archived))
        return q.order_by(RequiredDocument.mandatory.desc(), RequiredDocument.created_at, RequiredDocument.id).all()

    def _doc(self, doc_id: UUID) -> RequiredDocument:
        doc = self.db.query(RequiredDocument).filter_by(id=doc_id, company_id=self.company_id).first()
        if doc is None:
            raise LookupError("Document not found")
        return doc

    def _employee(self, employee_id: UUID) -> Employee:
        employee = self.db.query(Employee).filter_by(id=employee_id, company_id=self.company_id).first()
        if employee is None:
            raise LookupError("Employee not found")
        return employee

    def file(self, file_id: UUID) -> RequiredDocumentFile:
        f = self.db.query(RequiredDocumentFile).filter_by(id=file_id, company_id=self.company_id).first()
        if f is None:
            raise LookupError("File not found. It may have been replaced by a newer one.")
        return f

    def _files(self, employee_id: UUID | None = None) -> list[RequiredDocumentFile]:
        q = self.db.query(RequiredDocumentFile).filter(RequiredDocumentFile.company_id == self.company_id)
        if employee_id:
            q = q.filter(RequiredDocumentFile.employee_id == employee_id)
        return q.all()

    def _name_taken(self, name: str, doc_id: UUID | None) -> bool:
        return any(d.id != doc_id and d.name.lower() == name.lower() for d in self._docs())

    # ── The company's list ───────────────────────────────
    @staticmethod
    def _out(doc: RequiredDocument) -> dict:
        return {
            "id": doc.id, "name": doc.name, "instructions": doc.instructions, "mandatory": doc.mandatory,
            "department_ids": doc.department_ids, "employment_types": doc.employment_types,
            "archived": doc.archived,
        }

    def list_required(self) -> list[dict]:
        return [self._out(d) for d in self._docs(archived=None)]

    def save(self, data: dict, actor: UUID | None, doc_id: UUID | None = None) -> dict:
        doc = self._doc(doc_id) if doc_id else RequiredDocument(company_id=self.company_id)
        if self._name_taken(data["name"], doc_id):
            raise DocumentConflict("A document with this name already exists.")
        if data["department_ids"]:
            known = {str(i) for (i,) in self.db.query(Department.id).filter(Department.company_id == self.company_id)}
            # A department deleted since the last save may still be listed; it simply matches nobody.
            if set(data["department_ids"]) - known - set(doc.department_ids or []):
                raise ValueError("Unknown department.")
        for key, value in data.items():
            setattr(doc, key, value)
        self.db.add(doc)
        self.db.flush()
        self._log("updated" if doc_id else "created", doc.id, actor, doc.name)
        self.db.commit()
        return self._out(doc)

    def set_archived(self, doc_id: UUID, archived: bool, actor: UUID | None) -> dict:
        doc = self._doc(doc_id)
        if not archived and self._name_taken(doc.name, doc_id):
            raise DocumentConflict("A document with this name already exists.")
        doc.archived = archived
        self._log("archived" if archived else "restored", doc.id, actor, doc.name)
        self.db.commit()
        return self._out(doc)

    # ── One employee ─────────────────────────────────────
    def checklist(self, employee_id: UUID) -> list[dict]:
        employee = self._employee(employee_id)
        files = {f.required_document_id: f for f in self._files(employee_id)}
        items = []
        for doc in self._docs(archived=None):
            f = files.get(doc.id)
            required = not doc.archived and applies_to(doc, employee)
            # A file uploaded while the document still applied stays visible.
            if not required and f is None:
                continue
            items.append({
                "document_id": doc.id, "name": doc.name, "instructions": doc.instructions,
                "required": required, "mandatory": required and doc.mandatory,
                "status": f.status if f else "pending",
                "file": f and {
                    "id": f.id, "filename": f.filename, "uploaded_at": f.uploaded_at,
                    "by_hr": f.uploaded_by_employee_id != employee_id, "review_note": f.review_note,
                },
            })
        return items

    def pending_count(self, employee_id: UUID | None) -> int:
        if not employee_id:
            return 0
        return sum(i["mandatory"] and i["status"] in ("pending", "rejected") for i in self.checklist(employee_id))

    def upload(self, employee_id: UUID, doc_id: UUID, filename: str, content: bytes, actor: UUID | None,
               is_hr: bool) -> None:
        content_type = detect_type(content)
        employee, doc = self._employee(employee_id), self._doc(doc_id)
        if doc.archived or not applies_to(doc, employee):
            raise ValueError("This document is not required from this employee.")
        old = self.db.query(RequiredDocumentFile).filter_by(
            required_document_id=doc_id, employee_id=employee_id).with_for_update().first()
        if old is not None and old.status == "verified" and not is_hr:
            raise DocumentConflict("This document is already verified. Ask HR if it must be replaced.")
        old_storage_id = old.storage_id if old else None
        storage_id, storage_path = document_storage.save(self.company_id, employee_id, content, content_type)
        try:
            if old is not None:
                self.db.delete(old)
                self.db.flush()
            self.db.add(RequiredDocumentFile(
                company_id=self.company_id, required_document_id=doc_id, employee_id=employee_id,
                filename=filename, content_type=content_type, size=len(content),
                storage_id=storage_id, storage_path=storage_path,
                uploaded_by_employee_id=actor,
            ))
            self._log("uploaded", doc_id, actor, f"{doc.name} - {employee.full_name}")
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            document_storage.remove(storage_id)
            if isinstance(e, (IntegrityError, StaleDataError)):
                raise DocumentConflict("This document was just changed. Refresh and try again.")
            raise
        if old_storage_id:
            document_storage.remove(old_storage_id)

    @staticmethod
    def content(f: RequiredDocumentFile) -> bytes:
        return document_storage.load(f.storage_path)

    def review(self, file_id: UUID, decision: str, note: str, actor: UUID | None) -> None:
        f = self.file(file_id)
        if decision == "rejected" and not note:
            raise ValueError("Please write why it is rejected.")
        f.status = decision
        f.review_note = note if decision == "rejected" else ""
        f.reviewed_by_employee_id = actor
        f.reviewed_at = datetime.now(timezone.utc)
        title = f"{self._doc(f.required_document_id).name} - {self._employee(f.employee_id).full_name}"
        self._log(decision, f.required_document_id, actor, title)
        try:
            self.db.commit()
        except StaleDataError:
            self.db.rollback()
            raise DocumentConflict("This file was just replaced. Refresh and check the new one.")

    # ── Everyone ─────────────────────────────────────────
    def overview(self) -> dict:
        docs = self._docs()
        files = {(f.employee_id, f.required_document_id): f for f in self._files()}
        departments = dict(tuple(row) for row in self.db.query(Department.id, Department.name).filter(
            Department.company_id == self.company_id))
        employees = self.db.query(Employee).filter(
            Employee.company_id == self.company_id, Employee.employment_status == "active",
        ).order_by(Employee.full_name).all()

        rows = []
        for e in employees:
            statuses = {}
            for doc in docs:
                if applies_to(doc, e):
                    f = files.get((e.id, doc.id))
                    statuses[str(doc.id)] = f.status if f else "pending"
            mandatory = [statuses[str(d.id)] for d in docs if d.mandatory and str(d.id) in statuses]
            rows.append({
                "employee_id": e.id, "name": e.full_name, "code": e.employee_code,
                "department": departments.get(e.department_id),
                "employment_type": e.employment_type, "statuses": statuses,
                "total": len(mandatory), "verified": mandatory.count("verified"),
                "missing": sum(s in ("pending", "rejected") for s in mandatory),
                "to_review": list(statuses.values()).count("uploaded"),
            })
        return {"documents": [self._out(d) for d in docs], "employees": rows}

    def _log(self, what: str, entity_id: UUID, actor: UUID | None, title: str) -> None:
        log_action(
            self.db, self.company_id, actor, f"document.{what}", "required_document", entity_id, {"title": title})
