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

employee_id = "6c25ed91-af39-482b-89b1-bdb3cbf3ff98"  # Emily Davis
leave_type_id = "2b623143-d038-40ed-9617-d9075fc0ff3d"  # Sick Leave, balance 11.00

emp = db.query(Employee).filter(Employee.id == employee_id).first()
print("Employee company_id:", emp.company_id)

svc = LeaveService(db, emp.company_id)

# Check what get_specific actually returns
year = 2026
balance = svc.balance_repo.get_specific(employee_id, leave_type_id, year)
print("Balance fetched:", balance)
print("Balance value:", balance.balance if balance else None)

leave_type = svc.type_repo.get_by_id(leave_type_id)
print("Leave type fetched:", leave_type)
print("is_paid:", leave_type.is_paid if leave_type else None)

# Now try requesting 3 days leave (well within 11.00 balance)
data = {
    "leave_type_id": leave_type_id,
    "start_date": date(2026, 9, 1),
    "end_date": date(2026, 9, 3),
}
try:
    result = svc.request_leave(employee_id, data)
    print("SUCCESS:", result.id, result.status)
except ValueError as e:
    print("FAILED with error:", e)

db.close()
