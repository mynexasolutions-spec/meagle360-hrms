"""Department routes with tree endpoint for org hierarchy."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id
from app.repositories.department_repo import DepartmentRepository
from app.schemas.department import (
    DepartmentCreate,
    DepartmentUpdate,
    DepartmentResponse,
    DepartmentTreeNode,
)

router = APIRouter(prefix="/api/departments", tags=["Departments"])


@router.get("/", response_model=list[DepartmentResponse])
def list_departments(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = DepartmentRepository(db, company_id)
    return repo.get_all()


@router.post("/", response_model=DepartmentResponse, status_code=201)
def create_department(
    data: DepartmentCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = DepartmentRepository(db, company_id)
    return repo.create(data.model_dump())


@router.put("/{dept_id}", response_model=DepartmentResponse)
def update_department(
    dept_id: UUID,
    data: DepartmentUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = DepartmentRepository(db, company_id)
    dept = repo.update(dept_id, data.model_dump(exclude_unset=True))
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept


@router.delete("/{dept_id}", status_code=204)
def delete_department(
    dept_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    repo = DepartmentRepository(db, company_id)
    if not repo.delete(dept_id):
        raise HTTPException(status_code=404, detail="Department not found")


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
