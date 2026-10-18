"""Idempotent demo seed script for Meagle360 PMS (Performance Management System).

Seeds for every tenant company:
  1. Default PMS config (Manager 50 / Peer 30 / Self 20), 5 competency parameters,
     and 4 rating slabs.
  2. Ensures employees have departments, a reporting manager, and a base
     EmployeeSalaryAssignment so payroll revisions have real salary numbers.
  3. Cycle 1: "H1 2026 Performance Appraisal" (status = 'released')
     - Approved/locked goals + recorded progress (85% - 118% achievement)
     - Self, Manager, and All-Same-Department Peer ratings submitted
     - Final scores, Self-vs-Manager gap breakdown, Attendance % snapshot
     - Released results + Rating History
     - Payroll Hike Revisions generated (some suggested, some approved)
  4. Cycle 2: "H2 2026 Mid-Year Review" (status = 'rating')
     - Locked goals + progress
     - Open Self, Manager, and Department Peer rating tasks so any logged-in
       user (including Sarah Johnson) can test 'Rate Now' live from the UI.

Run from backend/:
    .\\venv\\Scripts\\python.exe seed_pms_demo.py
"""

import random
from datetime import date, datetime, timezone
from decimal import Decimal

from app.database import SessionLocal
from app.models.company import Company
from app.models.department import Department
from app.models.employee import Employee
from app.models.employee_salary_assignment import EmployeeSalaryAssignment
from app.models.pms import (
    Goal,
    GoalProgress,
    PayrollRevision,
    Rating,
    ReviewAssignment,
    ReviewCycle,
    ReviewParticipant,
)
from app.services.pms_assignment_service import PmsAssignmentService
from app.services.pms_config_service import PmsConfigService
from app.services.pms_cycle_service import PmsCycleService
from app.services.pms_goal_service import achievement_pct
from app.services.pms_results_service import PmsResultsService


GOAL_TEMPLATES = [
    ("Deliver core roadmap milestones on schedule", "output", Decimal("40"), Decimal("100"), "%"),
    ("Maintain quality & SLA benchmark", "quality", Decimal("35"), Decimal("100"), "%"),
    ("Process & cross-team collaboration initiatives", "kpi", Decimal("25"), Decimal("100"), "%"),
]


def _ensure_org_basics(db, company: Company) -> list[Employee]:
    emps = (
        db.query(Employee)
        .filter(Employee.company_id == company.id, Employee.employment_status == "active")
        .order_by(Employee.created_at)
        .all()
    )
    if not emps:
        return []

    depts = db.query(Department).filter(Department.company_id == company.id).all()
    if not depts:
        dept = Department(company_id=company.id, name="Engineering")
        db.add(dept)
        db.flush()
        depts = [dept]

    from app.models.user_account import UserAccount
    admin_emp_ids = {
        u.employee_id
        for u in db.query(UserAccount).filter(UserAccount.company_id == company.id).all()
        if u.employee_id is not None and any(r.name == "Admin" for r in u.all_roles)
    }
    lead = next((e for e in emps if e.id in admin_emp_ids), emps[0])
    # Put lead at index 0 so lead is the manager of colleagues and has pending tasks
    emps = [lead] + [e for e in emps if e.id != lead.id]

    for idx, e in enumerate(emps):
        # Make sure everyone has a department so same-department peer groups have 4+ members
        if e.department_id is None:
            e.department_id = depts[idx % min(len(depts), 2)].id
        # Ensure hire date is > 180 days ago so hike eligibility passes for most employees
        if e.date_of_hire > date(2025, 6, 1):
            e.date_of_hire = date(2024, 7, 15)
        if idx > 0 and e.manager_id is None:
            e.manager_id = lead.id

        # Ensure base salary assignment exists
        has_sal = (
            db.query(EmployeeSalaryAssignment)
            .filter(
                EmployeeSalaryAssignment.company_id == company.id,
                EmployeeSalaryAssignment.employee_id == e.id,
            )
            .first()
        )
        if not has_sal:
            base = Decimal(str(45000 + (idx % 6) * 8000))
            db.add(
                EmployeeSalaryAssignment(
                    company_id=company.id,
                    employee_id=e.id,
                    basic_pay=base,
                    annual_ctc=base * Decimal("20"),
                    effective_from=date(2025, 4, 1),
                )
            )
    db.commit()
    return emps


def _seed_goals_and_progress(db, company_id, cycle: ReviewCycle, emps: list[Employee], rng: random.Random):
    existing = db.query(Goal).filter(Goal.cycle_id == cycle.id).count()
    if existing > 0:
        return
    for e in emps:
        for title, cat, weight, target, unit in GOAL_TEMPLATES:
            actual = Decimal(str(rng.choice([82, 90, 96, 102, 108, 115])))
            pct = achievement_pct(actual, target, "higher_better")
            g = Goal(
                company_id=company_id,
                cycle_id=cycle.id,
                employee_id=e.id,
                title=title,
                description=f"Key {cat.upper()} deliverable for {cycle.name}",
                category=cat,
                weight=weight,
                target_value=target,
                unit=unit,
                direction="higher_better",
                status="locked",
                approved_by=e.manager_id,
                final_achievement_pct=pct,
            )
            db.add(g)
            db.flush()
            db.add(
                GoalProgress(
                    company_id=company_id,
                    goal_id=g.id,
                    recorded_on=cycle.end_date,
                    actual_value=actual,
                    achievement_pct=pct,
                    note="Verified milestone completion during cycle review.",
                    recorded_by=e.id,
                )
            )
    db.commit()


def _submit_assignments(db, company_id, cycle: ReviewCycle, rng: random.Random, leave_pending_for_emp_id=None):
    params = cycle.config_snapshot["parameters"]
    assigns = (
        db.query(ReviewAssignment)
        .filter(
            ReviewAssignment.company_id == company_id,
            ReviewAssignment.cycle_id == cycle.id,
            ReviewAssignment.status == "pending",
        )
        .all()
    )
    now = datetime.now(timezone.utc)
    for a in assigns:
        if leave_pending_for_emp_id and a.rater_id == leave_pending_for_emp_id:
            continue
        for p in params:
            if a.rater_type == "self":
                score = rng.choice([4, 5, 5])
            elif a.rater_type == "manager":
                score = rng.choice([3, 4, 4, 5])
            else:
                score = rng.choice([3, 4, 4, 4, 5])
            db.add(
                Rating(
                    company_id=company_id,
                    assignment_id=a.id,
                    parameter_id=p["id"],
                    cycle_id=cycle.id,
                    ratee_id=a.ratee_id,
                    rater_type=a.rater_type,
                    score=score,
                    comment="Consistent contribution and strong ownership." if a.rater_type != "peer" else None,
                )
            )
        a.status = "submitted"
        a.submitted_at = now
    db.commit()


def seed_pms_for_company(db, company: Company):
    print(f"\n=== Seeding PMS Demo Data for {company.name} ({company.id}) ===")
    cfg_svc = PmsConfigService(db, company.id)
    cfg_svc.get_config()

    emps = _ensure_org_basics(db, company)
    if len(emps) < 2:
        print("  Skipping: fewer than 2 active employees.")
        return

    lead = emps[0]
    cycle_svc = PmsCycleService(db, company.id)
    assign_svc = PmsAssignmentService(db, company.id)
    results_svc = PmsResultsService(db, company.id)
    rng = random.Random(42)

    # 1. Completed & Released Cycle: H1 2026 Performance Appraisal
    c1 = (
        db.query(ReviewCycle)
        .filter(
            ReviewCycle.company_id == company.id,
            ReviewCycle.name == "H1 2026 Performance Appraisal",
        )
        .first()
    )
    if not c1:
        c1 = cycle_svc.create_cycle(
            lead.id,
            {
                "name": "H1 2026 Performance Appraisal",
                "start_date": date(2026, 1, 1),
                "end_date": date(2026, 6, 30),
                "goal_setting_deadline": date(2026, 1, 20),
                "rating_start": date(2026, 6, 1),
                "rating_end": date(2026, 6, 20),
                "review_end": date(2026, 6, 30),
            },
        )
        c1 = cycle_svc.launch(lead.id, c1.id)
        _seed_goals_and_progress(db, company.id, c1, emps, rng)
        c1.status = "rating"
        assign_svc.generate_all(c1)
        db.commit()
        _submit_assignments(db, company.id, c1, rng)
        c1 = cycle_svc.advance(lead.id, c1.id)  # rating -> review (computes scores)
        c1 = results_svc.finalize_cycle(lead.id, c1.id)  # locks & generates payroll revisions
        c1 = results_svc.release_cycle(lead.id, c1.id)  # releases to employees

        # Approve first 2 payroll revisions so UI shows both 'approved' and 'suggested'
        revs = (
            db.query(PayrollRevision)
            .filter(PayrollRevision.company_id == company.id, PayrollRevision.cycle_id == c1.id)
            .limit(2)
            .all()
        )
        from app.services.pms_payroll_service import PmsPayrollService
        pay_svc = PmsPayrollService(db, company.id)
        for r in revs:
            if r.status == "suggested" and r.eligible:
                pay_svc.approve_revision(r.id, lead.id, r.suggested_hike_percent, date(2026, 7, 1))
        print(f"  Created & released cycle: {c1.name}")
    else:
        print(f"  Cycle already exists: {c1.name} ({c1.status})")

    # 2. Active Rating Cycle: H2 2026 Annual Appraisal (in 'rating' stage with open tasks)
    c2 = (
        db.query(ReviewCycle)
        .filter(
            ReviewCycle.company_id == company.id,
            ReviewCycle.name == "H2 2026 Annual Appraisal",
        )
        .first()
    )
    if not c2:
        c2 = cycle_svc.create_cycle(
            lead.id,
            {
                "name": "H2 2026 Annual Appraisal",
                "start_date": date(2026, 7, 1),
                "end_date": date(2026, 12, 31),
                "goal_setting_deadline": date(2026, 7, 20),
                "rating_start": date(2026, 10, 1),
                "rating_end": date(2026, 12, 15),
                "review_end": date(2026, 12, 31),
            },
        )
        c2 = cycle_svc.launch(lead.id, c2.id)
        _seed_goals_and_progress(db, company.id, c2, emps, rng)
        c2.status = "rating"
        assign_svc.generate_all(c2)
        db.commit()
        # Keep lead's rating tasks pending so Sarah Johnson sees open tasks in "My Rating Tasks",
        # while submitting other colleagues' tasks so peer counts are already populated.
        _submit_assignments(db, company.id, c2, rng, leave_pending_for_emp_id=lead.id)
        print(f"  Created active rating cycle: {c2.name} (open tasks kept for {lead.full_name})")
    else:
        lead_assigns = (
            db.query(ReviewAssignment)
            .filter(
                ReviewAssignment.company_id == company.id,
                ReviewAssignment.cycle_id == c2.id,
                ReviewAssignment.rater_id == lead.id,
            )
            .all()
        )
        for a in lead_assigns:
            if a.status == "submitted":
                db.query(Rating).filter(Rating.assignment_id == a.id).delete()
                a.status = "pending"
                a.submitted_at = None
        db.commit()
        print(f"  Cycle already exists: {c2.name} ({c2.status}) — ensured pending tasks for {lead.full_name}")


def main():
    db = SessionLocal()
    try:
        companies = db.query(Company).all()
        for comp in companies:
            seed_pms_for_company(db, comp)
        print("\nDone! Refresh /performance in the browser.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
