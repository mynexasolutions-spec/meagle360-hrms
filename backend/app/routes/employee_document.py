"""Other documents on an employee's file: the employee and HR only."""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user
from app.models.user_account import UserAccount
from app.routes.required_document import document_errors, file_response, self_or_hr
from app.services.employee_document_service import EmployeeDocumentService
from app.services.required_document_service import MAX_FILE_BYTES

router = APIRouter(prefix="/api/employees/{employee_id}/documents", tags=["Employee documents"])


def service(db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id)) -> EmployeeDocumentService:
    return EmployeeDocumentService(db, company_id)


@router.get("")
def list_documents(employee_id: UUID, svc: EmployeeDocumentService = Depends(service),
                   user: UserAccount = Depends(get_current_user)):
    is_hr = self_or_hr(user, employee_id)
    with document_errors():
        return svc.list(employee_id, user.employee_id, is_hr)


@router.post("", status_code=204)
def upload(employee_id: UUID, name: str = Form(max_length=100), file: UploadFile = File(...),
           svc: EmployeeDocumentService = Depends(service), user: UserAccount = Depends(get_current_user)):
    self_or_hr(user, employee_id)
    if not name.strip():
        raise HTTPException(status_code=400, detail="Document name is required.")
    content = file.file.read(MAX_FILE_BYTES + 1)
    with document_errors():
        svc.upload(employee_id, name.strip(), (file.filename or "document")[:200], content, user.employee_id)


@router.get("/{doc_id}/file")
def get_file(employee_id: UUID, doc_id: UUID, svc: EmployeeDocumentService = Depends(service),
             user: UserAccount = Depends(get_current_user)):
    self_or_hr(user, employee_id)
    with document_errors():
        doc = svc.get(employee_id, doc_id)
        content = svc.content(doc)
    return file_response(content, doc.content_type, doc.filename)


@router.delete("/{doc_id}", status_code=204)
def delete(employee_id: UUID, doc_id: UUID, svc: EmployeeDocumentService = Depends(service),
           user: UserAccount = Depends(get_current_user)):
    is_hr = self_or_hr(user, employee_id)
    with document_errors():
        doc = svc.get(employee_id, doc_id)
        if not svc.can_delete(doc, user.employee_id, is_hr):
            raise HTTPException(status_code=403, detail="Only HR can delete this document.")
        svc.delete(doc, user.employee_id)
