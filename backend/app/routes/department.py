"""Department routes with tree endpoint for org hierarchy."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, require_permissions
from app.models.department import Department
from app.models.employee import Employee
from app.models.user_account import UserAccount
from app.repositories.department_repo import DepartmentRepository
from app.services.audit_service import log_action
from app.schemas.department import (
    DepartmentCreate,
    DepartmentUpdate,
    DepartmentResponse,
    DepartmentTreeNode,
)

router = APIRouter(prefix="/api/departments", tags=["Departments"])


def _serialize(dept: Department, counts: dict) -> DepartmentResponse:
    return DepartmentResponse(
        id=dept.id,
        company_id=dept.company_id,
        name=dept.name,
        parent_department_id=dept.parent_department_id,
        head_id=dept.head_id,
        head_name=dept.head.full_name if dept.head else None,
        employee_count=counts.get(dept.id, 0),
        created_at=dept.created_at,
        updated_at=dept.updated_at,
    )


def _active_counts(db: Session, company_id: UUID) -> dict:
    rows = (
        db.query(Employee.department_id, func.count(Employee.id))
        .filter(
            Employee.company_id == company_id,
            Employee.department_id.isnot(None),
            Employee.employment_status == "active",
        )
        .group_by(Employee.department_id)
        .all()
    )
    return {dept_id: n for dept_id, n in rows}


def _validate_head(db: Session, company_id: UUID, head_id: UUID | None):
    if head_id is None:
        return
    exists = (
        db.query(Employee.id)
        .filter(Employee.id == head_id, Employee.company_id == company_id, Employee.employment_status == "active")
        .first()
    )
    if not exists:
        raise HTTPException(status_code=400, detail="Department head must be an active employee of this company")


@router.get("/", response_model=list[DepartmentResponse])
def list_departments(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = DepartmentRepository(db, company_id)
    counts = _active_counts(db, company_id)
    return [_serialize(d, counts) for d in repo.get_all()]


@router.post("/", response_model=DepartmentResponse, status_code=201)
def create_department(
    data: DepartmentCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("settings:write")),
):
    _validate_head(db, company_id, data.head_id)
    repo = DepartmentRepository(db, company_id)
    dept = repo.create(data.model_dump())
    return _serialize(dept, _active_counts(db, company_id))


@router.put("/{dept_id}", response_model=DepartmentResponse)
def update_department(
    dept_id: UUID,
    data: DepartmentUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    user: UserAccount = Depends(require_permissions("settings:write")),
):
    repo = DepartmentRepository(db, company_id)
    fields = data.model_dump(exclude_unset=True)
    # head_id may be explicitly set to null to clear the head; the generic
    # repo update skips None values, so handle it here.
    clear_head = "head_id" in fields and fields["head_id"] is None
    before = repo.get_by_id(dept_id)
    head_changed = before is not None and "head_id" in fields and fields["head_id"] != before.head_id
    if head_changed:
        _validate_head(db, company_id, fields["head_id"])
        log_action(db, company_id, user.employee_id, "department.head_changed", "department", dept_id,
                   {"title": before.name})
    dept = repo.update(dept_id, fields)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    if clear_head:
        dept.head_id = None
        db.commit()
        db.refresh(dept)
    return _serialize(dept, _active_counts(db, company_id))


@router.delete("/{dept_id}", status_code=204)
def delete_department(
    dept_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("settings:write")),
):
    repo = DepartmentRepository(db, company_id)
    if not repo.get_by_id(dept_id):
        raise HTTPException(status_code=404, detail="Department not found")
    has_employees = (
        db.query(Employee.id)
        .filter(Employee.company_id == company_id, Employee.department_id == dept_id)
        .first()
    )
    if has_employees:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a department that still has employees. Reassign them first.",
        )
    repo.delete(dept_id)


@router.get("/tree", response_model=list[DepartmentTreeNode])
def get_department_tree(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = DepartmentRepository(db, company_id)
    roots = repo.get_root_departments()

    def build_tree(dept):
        children = repo.get_children(dept.id)
        return DepartmentTreeNode(
            id=dept.id,
            name=dept.name,
            children=[build_tree(c) for c in children],
        )

    return [build_tree(r) for r in roots]
