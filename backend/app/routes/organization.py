"""Organization editor (Admin only): the data to draft on, and publishing the draft."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_company_id, require_permissions
from app.models.department import Department
from app.models.employee import Employee
from app.models.ats import JobOpening
from app.models.org_planning import VacantPosition
from app.models.user_account import UserAccount
from app.schemas.job_change import OrgPublish, VacancyCreate, VacancyUpdate
from app.services.audit_service import log_action
from app.services.job_change_service import JobChangeService, StaleDraftError

router = APIRouter(prefix="/api/organization", tags=["Organization"])


@router.get("")
def get_organization(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("settings:write")),
):
    employees = (
        db.query(Employee).options(joinedload(Employee.designation))
        .filter(Employee.company_id == company_id, Employee.employment_status == "active")
        .order_by(Employee.full_name).all()
    )
    departments = db.query(Department).filter(Department.company_id == company_id).order_by(Department.name).all()
    vacancies = (
        db.query(VacantPosition).options(joinedload(VacantPosition.job))
        .filter(VacantPosition.company_id == company_id).order_by(VacantPosition.created_at).all()
    )
    jobs = (
        db.query(JobOpening.id, JobOpening.title, JobOpening.status)
        .filter(JobOpening.company_id == company_id, JobOpening.status != "Closed")
        .order_by(JobOpening.title).all()
    )
    return {
        "vacancies": [
            {
                "id": v.id, "title": v.title, "department_id": v.department_id, "manager_id": v.manager_id,
                "job_id": v.job_id, "job_title": v.job.title if v.job else None,
                "job_status": v.job.status if v.job else None,
            }
            for v in vacancies
        ],
        "jobs": [{"id": j.id, "title": j.title, "status": j.status} for j in jobs],
        "employees": [
            {
                "id": e.id, "full_name": e.full_name, "employee_code": e.employee_code, "photo_url": e.photo_url,
                "designation_name": e.designation.title if e.designation else None,
                "manager_id": e.manager_id, "department_id": e.department_id,
            }
            for e in employees
        ],
        "departments": [{"id": d.id, "name": d.name, "head_id": d.head_id} for d in departments],
    }


@router.post("/publish")
def publish(
    data: OrgPublish,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    user: UserAccount = Depends(require_permissions("settings:write")),
):
    try:
        count = JobChangeService(db, company_id).publish([m.model_dump() for m in data.moves], user.employee_id)
    except StaleDraftError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return {"published": count}


def _require(db: Session, model, company_id: UUID, id_: UUID, label: str) -> None:
    if not db.query(model.id).filter(model.id == id_, model.company_id == company_id).first():
        raise HTTPException(status_code=400, detail=f"{label} not found")


def _vacancy(db: Session, company_id: UUID, vacancy_id: UUID) -> VacantPosition:
    row = db.query(VacantPosition).filter(
        VacantPosition.id == vacancy_id, VacantPosition.company_id == company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Vacant position not found")
    return row


@router.post("/vacancies", status_code=201)
def create_vacancy(
    data: VacancyCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    user: UserAccount = Depends(require_permissions("settings:write")),
):
    title = data.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Enter a title")
    _require(db, Department, company_id, data.department_id, "Department")
    _require(db, Employee, company_id, data.manager_id, "Manager")
    if data.job_id:
        _require(db, JobOpening, company_id, data.job_id, "Job opening")
    row = VacantPosition(company_id=company_id, **{**data.model_dump(), "title": title})
    db.add(row)
    db.flush()
    log_action(db, company_id, user.employee_id, "vacancy.created", "vacant_position", row.id, {"title": title})
    db.commit()
    return {"id": row.id}


@router.put("/vacancies/{vacancy_id}")
def update_vacancy(
    vacancy_id: UUID,
    data: VacancyUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("settings:write")),
):
    row = _vacancy(db, company_id, vacancy_id)
    if data.job_id:
        _require(db, JobOpening, company_id, data.job_id, "Job opening")
    row.job_id = data.job_id
    db.commit()
    return {"id": row.id}


@router.delete("/vacancies/{vacancy_id}", status_code=204)
def delete_vacancy(
    vacancy_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    user: UserAccount = Depends(require_permissions("settings:write")),
):
    row = _vacancy(db, company_id, vacancy_id)
    log_action(db, company_id, user.employee_id, "vacancy.removed", "vacant_position", row.id, {"title": row.title})
    db.delete(row)
    db.commit()
