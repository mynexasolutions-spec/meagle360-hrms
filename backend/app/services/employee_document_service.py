"""Documents on an employee's file that nobody asked for: upload, view, delete."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_document import EmployeeDocument
from app.services import document_storage
from app.services.audit_service import log_action
from app.services.required_document_service import detect_type


class EmployeeDocumentService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    def employee(self, employee_id: UUID) -> Employee:
        employee = self.db.query(Employee).filter_by(id=employee_id, company_id=self.company_id).first()
        if employee is None:
            raise LookupError("Employee not found")
        return employee

    def get(self, employee_id: UUID, doc_id: UUID) -> EmployeeDocument:
        doc = self.db.query(EmployeeDocument).filter_by(
            id=doc_id, employee_id=employee_id, company_id=self.company_id).first()
        if doc is None:
            raise LookupError("Document not found")
        return doc

    @staticmethod
    def can_delete(doc: EmployeeDocument, viewer: UUID | None, is_hr: bool) -> bool:
        return is_hr or (viewer is not None and doc.uploaded_by_employee_id == viewer)

    def list(self, employee_id: UUID, viewer: UUID | None, is_hr: bool) -> list[dict]:
        self.employee(employee_id)
        docs = self.db.query(EmployeeDocument).filter_by(
            employee_id=employee_id, company_id=self.company_id).order_by(EmployeeDocument.created_at.desc()).all()
        return [{
            "id": d.id, "name": d.doc_type, "created_at": d.created_at,
            "filename": d.filename, "has_file": bool(d.storage_path),
            # Saved before uploads existed. Only web links are ever opened.
            "link": d.file_url if (d.file_url or "").lower().startswith(("https://", "http://")) else None,
            "can_delete": self.can_delete(d, viewer, is_hr),
        } for d in docs]

    def upload(self, employee_id: UUID, name: str, filename: str, content: bytes, actor: UUID | None) -> None:
        content_type = detect_type(content)
        employee = self.employee(employee_id)
        storage_id, storage_path = document_storage.save(self.company_id, employee_id, content, content_type)
        try:
            doc = EmployeeDocument(
                company_id=self.company_id, employee_id=employee_id, doc_type=name, file_url="", e_signed=False,
                filename=filename, content_type=content_type, storage_id=storage_id, storage_path=storage_path,
                uploaded_by_employee_id=actor,
            )
            self.db.add(doc)
            self.db.flush()
            self._log("uploaded", doc, actor, employee)
            self.db.commit()
        except Exception:
            self.db.rollback()
            document_storage.remove(storage_id)
            raise

    def content(self, doc: EmployeeDocument) -> bytes:
        if not doc.storage_path:
            raise LookupError("This document has no uploaded file")
        return document_storage.load(doc.storage_path)

    def delete(self, doc: EmployeeDocument, actor: UUID | None) -> None:
        storage_id = doc.storage_id
        self._log("deleted", doc, actor, self.employee(doc.employee_id))
        self.db.delete(doc)
        self.db.commit()
        if storage_id:
            document_storage.remove(storage_id)

    def _log(self, what: str, doc: EmployeeDocument, actor: UUID | None, employee: Employee) -> None:
        log_action(self.db, self.company_id, actor, f"document.{what}", "employee_document", doc.id,
                   {"title": f"{doc.doc_type} - {employee.full_name}"})
