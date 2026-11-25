"""Company policy routes: everyone reads and agrees, settings:write manages."""

from contextlib import contextmanager
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.services.ats_file_service import MAX_RESUME_SIZE_BYTES, validate_pdf_content
from app.services.policy_service import PolicyConflict, PolicyService

router = APIRouter(prefix="/api/policies", tags=["Policies"])
admin = require_permissions("settings:write")


class PolicyIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=100_000)
    requires_ack: bool = False

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Title is required")
        return value


class AckIn(BaseModel):
    version: int


class PublishIn(BaseModel):
    ask_again: bool = True


class VisibilityIn(BaseModel):
    hidden: bool


class OrderIn(BaseModel):
    ids: list[UUID] = Field(max_length=500)


def service(db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id)) -> PolicyService:
    return PolicyService(db, company_id)


@contextmanager
def _errors():
    try:
        yield
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PolicyConflict as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/")
def list_policies(svc: PolicyService = Depends(service), user: UserAccount = Depends(get_current_user)):
    return svc.list_published(user.employee_id)


@router.get("/pending-count")
def pending_count(svc: PolicyService = Depends(service), user: UserAccount = Depends(get_current_user)):
    return {"count": svc.pending_count(user.employee_id)}


@router.get("/manage")
def manage_list(svc: PolicyService = Depends(service), _: UserAccount = Depends(admin)):
    return svc.manage_list()


@router.post("/manage", status_code=201)
def create_policy(data: PolicyIn, svc: PolicyService = Depends(service), user: UserAccount = Depends(admin)):
    return svc.create(data.model_dump(), user.employee_id)


@router.put("/manage/order", status_code=204)
def reorder(data: OrderIn, svc: PolicyService = Depends(service), _: UserAccount = Depends(admin)):
    with _errors():
        svc.reorder(data.ids)


@router.put("/manage/{policy_id}")
def update_policy(policy_id: UUID, data: PolicyIn, svc: PolicyService = Depends(service),
                  user: UserAccount = Depends(admin)):
    with _errors():
        return svc.update(policy_id, data.model_dump(), user.employee_id)


@router.delete("/manage/{policy_id}", status_code=204)
def delete_policy(policy_id: UUID, svc: PolicyService = Depends(service), user: UserAccount = Depends(admin)):
    with _errors():
        svc.delete(policy_id, user.employee_id)


@router.post("/manage/{policy_id}/publish")
def publish(policy_id: UUID, data: PublishIn, svc: PolicyService = Depends(service),
            user: UserAccount = Depends(admin)):
    with _errors():
        return svc.publish(policy_id, data.ask_again, user.employee_id)


@router.post("/manage/{policy_id}/visibility")
def visibility(policy_id: UUID, data: VisibilityIn, svc: PolicyService = Depends(service),
               user: UserAccount = Depends(admin)):
    with _errors():
        return svc.set_hidden(policy_id, data.hidden, user.employee_id)


@router.post("/manage/{policy_id}/reset")
def reset(policy_id: UUID, svc: PolicyService = Depends(service), user: UserAccount = Depends(admin)):
    with _errors():
        return svc.reset(policy_id, user.employee_id)


@router.get("/manage/{policy_id}/versions")
def versions(policy_id: UUID, svc: PolicyService = Depends(service), _: UserAccount = Depends(admin)):
    with _errors():
        return svc.versions(policy_id)


@router.get("/manage/{policy_id}/report")
def report(policy_id: UUID, svc: PolicyService = Depends(service), _: UserAccount = Depends(admin)):
    with _errors():
        return svc.report(policy_id)


@router.post("/manage/{policy_id}/attachment")
def attach(policy_id: UUID, file: UploadFile = File(...), svc: PolicyService = Depends(service),
           user: UserAccount = Depends(admin)):
    content = file.file.read(MAX_RESUME_SIZE_BYTES + 1)
    ok, problem = validate_pdf_content(content)
    if not ok:
        raise HTTPException(status_code=400, detail=problem)
    with _errors():
        return svc.attach(policy_id, (file.filename or "policy.pdf")[:200], content, user.employee_id)


@router.delete("/manage/{policy_id}/attachment")
def detach(policy_id: UUID, svc: PolicyService = Depends(service), user: UserAccount = Depends(admin)):
    with _errors():
        return svc.detach(policy_id, user.employee_id)


def _pdf(f) -> Response:
    return Response(f.content, media_type="application/pdf", headers={
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(f.filename)}",
        "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
    })


@router.get("/manage/{policy_id}/attachment")
def draft_attachment(policy_id: UUID, svc: PolicyService = Depends(service), _: UserAccount = Depends(admin)):
    with _errors():
        return _pdf(svc.attachment(policy_id, working_copy=True))


@router.get("/{policy_id}/attachment")
def attachment(policy_id: UUID, svc: PolicyService = Depends(service),
               _: UserAccount = Depends(get_current_user)):
    with _errors():
        return _pdf(svc.attachment(policy_id, working_copy=False))


@router.post("/{policy_id}/acknowledge", status_code=204)
def acknowledge(policy_id: UUID, data: AckIn, svc: PolicyService = Depends(service),
                user: UserAccount = Depends(get_current_user)):
    if not user.employee_id:
        raise HTTPException(status_code=400, detail="No employee record is linked to this login")
    with _errors():
        svc.acknowledge(policy_id, user.employee_id, data.version)
