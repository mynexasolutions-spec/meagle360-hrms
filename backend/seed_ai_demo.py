"""Idempotent demo seed script for the Meagle360 AI Assistant.

Seeds realistic Indian employees across Engineering, Product, HR, Sales, and Finance
into all existing companies (or creates a demo company if none exists), along with:
- Today's attendance: 10 On-Time Present, 4 Late Comers, 2 Approved Leaves, 2 Absent
- 2 Pending Leave Requests for next week
- Leave Balances (Casual, Sick, Earned) for all seeded employees

Run anytime before a demo:
    python seed_ai_demo.py
"""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from app.database import SessionLocal
from app.models.attendance_record import AttendanceRecord
from app.models.company import Company
from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee
from app.models.leave_balance import LeaveBalance
from app.models.leave_request import LeaveRequest
from app.models.leave_type import LeaveType
from app.services.attendance_service import IST_OFFSET, _local_date


DEMO_ROSTER = [
    # (code, full_name, dept, designation, mode, check_in_hm, check_out_hm)
    # 10 On-Time Present (<= 09:15 AM IST)
    ("DEMO101", "Rahul Sharma", "Engineering", "Senior Software Engineer", "present", (8, 52), None),
    ("DEMO102", "Priya Nair", "Engineering", "Frontend Developer", "present", (9, 4), None),
    ("DEMO103", "Aarav Mehta", "Engineering", "DevOps Engineer", "present", (9, 10), None),
    ("DEMO104", "Sneha Kulkarni", "Product", "Product Manager", "present", (8, 58), None),
    ("DEMO105", "Vikramaditya Rao", "Sales", "Enterprise Account Executive", "present", (9, 0), (17, 45)),
    ("DEMO106", "Ananya Chatterjee", "HR", "HR Operations Specialist", "present", (9, 8), None),
    ("DEMO107", "Karan Malhotra", "Finance", "Senior Financial Analyst", "present", (9, 12), None),
    ("DEMO108", "Divya Krishnan", "Engineering", "QA Automation Lead", "present", (8, 47), None),
    ("DEMO109", "Rohan Deshmukh", "Product", "UI/UX Designer", "present", (9, 14), None),
    ("DEMO110", "Neha Verma", "Sales", "Customer Success Manager", "present", (9, 5), None),
    # 4 Late Comers (> 09:15 AM IST)
    ("DEMO111", "Siddharth Joshi", "Engineering", "Backend Developer", "late", (9, 34), None),
    ("DEMO112", "Pooja Agarwal", "Sales", "Regional Sales Manager", "late", (9, 48), None),
    ("DEMO113", "Aditya Tiwari", "Engineering", "Full Stack Engineer", "late", (10, 12), None),
    ("DEMO114", "Meera Iyer", "Finance", "Payroll Specialist", "late", (10, 35), None),
    # 2 On Approved Leave Today
    ("DEMO115", "Kabir Singhania", "Engineering", "Tech Lead", "leave_casual", None, None),
    ("DEMO116", "Ishita Banerjee", "HR", "Talent Acquisition Partner", "leave_sick", None, None),
    # 2 Absent Today (no clock-in, no leave)
    ("DEMO117", "Nikhil Chauhan", "Sales", "Business Development Rep", "absent", None, None),
    ("DEMO118", "Tanvi Saxena", "Product", "Business Analyst", "absent", None, None),
]


def ist_to_utc(target_day: date, hour: int, minute: int) -> datetime:
    ist_dt = datetime.combine(target_day, time(hour, minute))
    utc_dt = ist_dt - IST_OFFSET
    return utc_dt.replace(tzinfo=timezone.utc)


def seed_for_company(db, company: Company, today_ist: date):
    print(f"\n-- Seeding AI Demo Data for Company: {company.name} ({company.id}) --")

    # 1. Ensure Departments
    dept_map: dict[str, Department] = {}
    for dept_name in ("Engineering", "Product", "HR", "Sales", "Finance"):
        dept = (
            db.query(Department)
            .filter(Department.company_id == company.id, Department.name == dept_name)
            .first()
        )
        if not dept:
            dept = Department(company_id=company.id, name=dept_name)
            db.add(dept)
            db.flush()
        dept_map[dept_name] = dept

    # 2. Ensure Designations
    desig_map: dict[str, Designation] = {}
    for _, _, _, desig_title, _, _, _ in DEMO_ROSTER:
        if desig_title in desig_map:
            continue
        desig = (
            db.query(Designation)
            .filter(Designation.company_id == company.id, Designation.title == desig_title)
            .first()
        )
        if not desig:
            desig = Designation(company_id=company.id, title=desig_title, is_active=True)
            db.add(desig)
            db.flush()
        desig_map[desig_title] = desig

    # 3. Ensure Leave Types
    lt_map: dict[str, LeaveType] = {}
    for lt_name, rate in (("Casual Leave", "1.00"), ("Sick Leave", "1.00"), ("Earned Leave", "1.50")):
        lt = (
            db.query(LeaveType)
            .filter(LeaveType.company_id == company.id, LeaveType.name == lt_name)
            .first()
        )
        if not lt:
            lt = LeaveType(
                company_id=company.id,
                name=lt_name,
                accrual_rate=Decimal(rate),
                is_paid=True,
            )
            db.add(lt)
            db.flush()
        lt_map[lt_name] = lt

    # 4. Upsert Employees, Balances, Today's Attendance & Leaves
    emp_by_code: dict[str, Employee] = {}
    for code, full_name, dept_name, desig_title, mode, in_hm, out_hm in DEMO_ROSTER:
        emp = (
            db.query(Employee)
            .filter(Employee.company_id == company.id, Employee.employee_code == code)
            .first()
        )
        if not emp:
            emp = Employee(
                company_id=company.id,
                employee_code=code,
                full_name=full_name,
                department_id=dept_map[dept_name].id,
                designation_id=desig_map[desig_title].id,
                date_of_hire=date(2024, 6, 1),
                employment_status="active",
                employment_type="full_time",
            )
            db.add(emp)
            db.flush()
        else:
            emp.full_name = full_name
            emp.department_id = dept_map[dept_name].id
            emp.designation_id = desig_map[desig_title].id
            emp.employment_status = "active"
            db.flush()

        emp_by_code[code] = emp

        # Ensure Leave Balances for current year
        for lt_name, default_bal in (("Casual Leave", 8), ("Sick Leave", 6), ("Earned Leave", 12)):
            lt_obj = lt_map[lt_name]
            bal = (
                db.query(LeaveBalance)
                .filter(
                    LeaveBalance.company_id == company.id,
                    LeaveBalance.employee_id == emp.id,
                    LeaveBalance.leave_type_id == lt_obj.id,
                    LeaveBalance.year == today_ist.year,
                )
                .first()
            )
            if not bal:
                db.add(
                    LeaveBalance(
                        company_id=company.id,
                        employee_id=emp.id,
                        leave_type_id=lt_obj.id,
                        balance=Decimal(str(default_bal)),
                        year=today_ist.year,
                    )
                )

        # Clear any existing demo attendance record for today so re-running is clean
        existing_records = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.company_id == company.id,
                AttendanceRecord.employee_id == emp.id,
            )
            .all()
        )
        for rec in existing_records:
            if _local_date(rec.clock_in) == today_ist:
                db.delete(rec)

        # Clear any existing leave requests for this demo employee overlapping today
        existing_leaves = (
            db.query(LeaveRequest)
            .filter(
                LeaveRequest.company_id == company.id,
                LeaveRequest.employee_id == emp.id,
                LeaveRequest.start_date <= today_ist + timedelta(days=10),
                LeaveRequest.end_date >= today_ist - timedelta(days=2),
            )
            .all()
        )
        for lr in existing_leaves:
            db.delete(lr)

        db.flush()

        if mode in ("present", "late") and in_hm:
            cin_utc = ist_to_utc(today_ist, in_hm[0], in_hm[1])
            cout_utc = ist_to_utc(today_ist, out_hm[0], out_hm[1]) if out_hm else None
            db.add(
                AttendanceRecord(
                    company_id=company.id,
                    employee_id=emp.id,
                    clock_in=cin_utc,
                    clock_out=cout_utc,
                    source="web",
                    summary="Working on sprint deliverables",
                )
            )
        elif mode == "leave_casual":
            db.add(
                LeaveRequest(
                    company_id=company.id,
                    employee_id=emp.id,
                    leave_type_id=lt_map["Casual Leave"].id,
                    start_date=today_ist,
                    end_date=today_ist + timedelta(days=1),
                    status="approved",
                )
            )
        elif mode == "leave_sick":
            db.add(
                LeaveRequest(
                    company_id=company.id,
                    employee_id=emp.id,
                    leave_type_id=lt_map["Sick Leave"].id,
                    start_date=today_ist,
                    end_date=today_ist,
                    status="approved",
                )
            )

    # 5. Add 2 Pending Leave Requests for next week (for Pending Approvals query)
    next_mon = today_ist + timedelta(days=3)
    for code, lt_name, days_len in (("DEMO101", "Earned Leave", 2), ("DEMO104", "Casual Leave", 1)):
        emp = emp_by_code[code]
        db.add(
            LeaveRequest(
                company_id=company.id,
                employee_id=emp.id,
                leave_type_id=lt_map[lt_name].id,
                start_date=next_mon,
                end_date=next_mon + timedelta(days=days_len - 1),
                status="pending",
            )
        )

    db.commit()
    print(
        f"[OK] Seeded 18 demo employees for '{company.name}' on {today_ist.isoformat()} "
        "(10 On-Time, 4 Late, 2 On Leave, 2 Absent, 2 Pending Approvals)."
    )


def main():
    db = SessionLocal()
    try:
        today_ist = (datetime.now(timezone.utc) + IST_OFFSET).date()
        companies = db.query(Company).all()
        if not companies:
            print("No company found in DB. Please register a company first via the UI.")
            return
        for comp in companies:
            seed_for_company(db, comp, today_ist)
    finally:
        db.close()


if __name__ == "__main__":
    main()
