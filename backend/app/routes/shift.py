"""Shift routes — shift templates CRUD and employee assignment/roster."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id
from app.services.shift_service import ShiftService
from app.schemas.shift import (
    ShiftCreate,
    ShiftUpdate,
    ShiftResponse,
    EmployeeShiftAssign,
    EmployeeShiftUpdate,
    EmployeeShiftResponse,
)

router = APIRouter(prefix="/api/shifts", tags=["Shifts"])


@router.get("/", response_model=list[ShiftResponse])
def list_shifts(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    svc = ShiftService(db, company_id)
    return svc.list_shifts()


from app.dependencies import get_company_id, require_permissions, get_current_user
from app.models.user_account import UserAccount

@router.post("/", response_model=ShiftResponse, status_code=201)
def create_shift(
    data: ShiftCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("settings:write")),
):
    svc = ShiftService(db, company_id)
    return svc.create_shift(data.model_dump())


@router.put("/{shift_id}", response_model=ShiftResponse)
def update_shift(
    shift_id: UUID,
    data: ShiftUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("settings:write")),
):
    svc = ShiftService(db, company_id)
    shift = svc.update_shift(shift_id, data.model_dump(exclude_unset=True))
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    return shift


@router.delete("/{shift_id}", status_code=204)
def delete_shift(
    shift_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("settings:write")),
):
    svc = ShiftService(db, company_id)
    if not svc.delete_shift(shift_id):
        raise HTTPException(status_code=404, detail="Shift not found")


@router.post("/assign", response_model=EmployeeShiftResponse, status_code=201)
def assign_shift(
    data: EmployeeShiftAssign,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    from app.models.employee import Employee
    isAdmin = current_user.role.name == "Admin" if current_user.role else False
    isManagerPermission = bool(current_user.merged_permissions.get("attendance:approve") or current_user.merged_permissions.get("settings:write"))

    target_emp = db.query(Employee).filter(Employee.id == data.employee_id, Employee.company_id == company_id).first()
    if not target_emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    isDirectManager = target_emp.manager_id == current_user.employee_id

    if not (isAdmin or isManagerPermission or isDirectManager):
        raise HTTPException(status_code=403, detail="You do not have permission to assign shifts to this employee")

    svc = ShiftService(db, company_id)
    assignment = svc.assign_shift(data.model_dump())
    return EmployeeShiftResponse(
        id=assignment.id,
        employee_id=assignment.employee_id,
        shift_id=assignment.shift_id,
        effective_from=assignment.effective_from,
    )


@router.get("/roster", response_model=list[EmployeeShiftResponse])
def get_roster(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    svc = ShiftService(db, company_id)
    roster = svc.get_roster(skip, limit)
    return [
        EmployeeShiftResponse(
            id=r.id,
            employee_id=r.employee_id,
            shift_id=r.shift_id,
            effective_from=r.effective_from,
            employee_name=r.employee.full_name if r.employee else None,
            shift_type=r.shift.shift_type if r.shift else None,
        )
        for r in roster
    ]


@router.put("/assign/{assignment_id}", response_model=EmployeeShiftResponse)
def update_assigned_shift(
    assignment_id: UUID,
    data: EmployeeShiftUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    from app.models.employee_shift import EmployeeShift
    assignment = db.query(EmployeeShift).filter(EmployeeShift.id == assignment_id, EmployeeShift.company_id == company_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Shift assignment not found")

    isAdmin = current_user.role.name == "Admin" if current_user.role else False
    isManagerPermission = bool(current_user.merged_permissions.get("attendance:approve") or current_user.merged_permissions.get("settings:write"))
    isDirectManager = assignment.employee and assignment.employee.manager_id == current_user.employee_id

    if not (isAdmin or isManagerPermission or isDirectManager):
        raise HTTPException(status_code=403, detail="You do not have permission to update this shift assignment")

    svc = ShiftService(db, company_id)
    updated = svc.update_assignment(assignment_id, data.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Failed to update shift assignment")
    return EmployeeShiftResponse(
        id=updated.id,
        employee_id=updated.employee_id,
        shift_id=updated.shift_id,
        effective_from=updated.effective_from,
        employee_name=updated.employee.full_name if updated.employee else None,
        shift_type=updated.shift.shift_type if updated.shift else None,
    )


@router.delete("/assign/{assignment_id}", status_code=204)
def delete_assigned_shift(
    assignment_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    from app.models.employee_shift import EmployeeShift
    assignment = db.query(EmployeeShift).filter(EmployeeShift.id == assignment_id, EmployeeShift.company_id == company_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Shift assignment not found")

    isAdmin = current_user.role.name == "Admin" if current_user.role else False
    isManagerPermission = bool(current_user.merged_permissions.get("attendance:approve") or current_user.merged_permissions.get("settings:write"))
    isDirectManager = assignment.employee and assignment.employee.manager_id == current_user.employee_id

    if not (isAdmin or isManagerPermission or isDirectManager):
        raise HTTPException(status_code=403, detail="You do not have permission to delete this shift assignment")

    svc = ShiftService(db, company_id)
    if not svc.delete_assignment(assignment_id):
        raise HTTPException(status_code=404, detail="Failed to delete shift assignment")


