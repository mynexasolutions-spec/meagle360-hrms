import os
from dotenv import load_dotenv
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

from app.services.leave_service import LeaveService
from app.models.employee import Employee
from app.models.leave_balance import LeaveBalance
from app.models.leave_type import LeaveType

employee_id = "00034d24-3e17-4467-b21b-223ef91c7f07"
emp = db.query(Employee).filter(Employee.id == employee_id).first()
svc = LeaveService(db, emp.company_id)

all_types = db.query(LeaveType).filter(LeaveType.company_id == emp.company_id).all()
existing_balance_type_ids = set()
for b in db.query(LeaveBalance).filter(LeaveBalance.employee_id == employee_id).all():
    existing_balance_type_ids.add(b.leave_type_id)

missing = []
for t in all_types:
    if t.id not in existing_balance_type_ids:
        missing.append(t)

if len(missing) == 0:
    print("Employee has a balance row for every leave type.")
else:
    lt = missing[0]
    print("Testing leave_type with NO balance row:", lt.name, "is_paid=", lt.is_paid)
    balance = svc.balance_repo.get_specific(employee_id, lt.id, 2026)
    print("get_specific result:", balance)
    data = {
        "leave_type_id": lt.id,
        "start_date": date(2026, 9, 1),
        "end_date": date(2026, 9, 2),
    }
    try:
        result = svc.request_leave(employee_id, data)
        print("SUCCESS:", result.id, result.status)
    except ValueError as e:
        print("FAILED with error:", e)

db.close()
