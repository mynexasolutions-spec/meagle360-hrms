"""PMS payroll revision service: hike suggestions, admin approval, and explicit
application to EmployeeSalaryAssignment.

Safeguards:
  1. Never auto-applied: finalizing a cycle only creates `status='suggested'`
     rows derived from the frozen `config_snapshot["slabs"]`.
  2. Admin must explicitly approve (`status='approved'`) or reject
     (`status='rejected'`). Overriding `suggested_hike_percent` requires a
     non-empty `override_reason`.
  3. Applying an approved revision (`status='applied'`) is a separate explicit
     action that inserts a NEW `EmployeeSalaryAssignment` row effective from
     `effective_date`, preserving all previous salary rows intact.
"""

from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_salary_assignment import EmployeeSalaryAssignment
from app.models.pms import PayrollRevision, ReviewCycle, ReviewParticipant
from app.services.pms_audit import pms_log
from app.services.pms_config_service import PmsConfigError, pick_slab

TWO = Decimal("0.01")
HUNDRED = Decimal("100")


def compute_hiked_pay(
    basic_pay: Decimal | None,
    annual_ctc: Decimal | None,
    hike_percent: Decimal,
) -> tuple[Decimal | None, Decimal | None]:
    """Pure calculation: returns (new_basic_pay, new_annual_ctc) rounded to 2 decimals."""
    pct = Decimal(str(hike_percent))
    factor = (HUNDRED + pct) / HUNDRED
    new_basic = (
        (Decimal(str(basic_pay)) * factor).quantize(TWO, rounding=ROUND_HALF_UP)
        if basic_pay is not None
        else None
    )
    new_ctc = (
        (Decimal(str(annual_ctc)) * factor).quantize(TWO, rounding=ROUND_HALF_UP)
        if annual_ctc is not None
        else None
    )
    return new_basic, new_ctc


def evaluate_hike_eligibility(
    employment_status: str,
    date_of_hire: date,
    cycle_end_date: date,
    min_tenure_days: int,
    effective_score: Decimal | None,
) -> tuple[bool, str | None]:
    """Pure eligibility check for PMS hike."""
    if employment_status != "active":
        return False, f"Employment status is '{employment_status}'"
    tenure_days = (cycle_end_date - date_of_hire).days
    if tenure_days < int(min_tenure_days):
        return False, f"Tenure ({tenure_days} days) is below minimum ({min_tenure_days} days)"
    if effective_score is None:
        return False, "No final PMS score available"
    return True, None


class PmsPayrollService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    def _cycle(self, cycle_id: UUID) -> ReviewCycle:
        c = self.db.query(ReviewCycle).filter(
            ReviewCycle.id == cycle_id, ReviewCycle.company_id == self.company_id
        ).first()
        if not c:
            raise LookupError("Cycle not found")
        return c

    def _revision(self, revision_id: UUID) -> PayrollRevision:
        r = self.db.query(PayrollRevision).filter(
            PayrollRevision.id == revision_id,
            PayrollRevision.company_id == self.company_id,
        ).first()
        if not r:
            raise LookupError("Payroll revision not found")
        return r

    def _current_salary(self, employee_id: UUID, as_of: date) -> EmployeeSalaryAssignment | None:
        row = (
            self.db.query(EmployeeSalaryAssignment)
            .filter(
                EmployeeSalaryAssignment.company_id == self.company_id,
                EmployeeSalaryAssignment.employee_id == employee_id,
                EmployeeSalaryAssignment.effective_from <= as_of,
            )
            .order_by(EmployeeSalaryAssignment.effective_from.desc(), EmployeeSalaryAssignment.created_at.desc())
            .first()
        )
        if row:
            return row
        return (
            self.db.query(EmployeeSalaryAssignment)
            .filter(
                EmployeeSalaryAssignment.company_id == self.company_id,
                EmployeeSalaryAssignment.employee_id == employee_id,
            )
            .order_by(EmployeeSalaryAssignment.effective_from.desc(), EmployeeSalaryAssignment.created_at.desc())
            .first()
        )

    # ── Generate hike suggestions ────────────────────────────
    def generate_for_cycle(
        self, cycle: ReviewCycle, actor_id: UUID | None = None, commit: bool = True
    ) -> int:
        if cycle.status not in ("finalized", "released", "payroll_approved"):
            raise PmsConfigError("Cycle must be finalized before generating payroll revisions")
        snap = cycle.config_snapshot
        min_tenure = int(snap["config"].get("min_tenure_days_for_hike", 180))
        slabs = snap["slabs"]
        default_eff_date = cycle.end_date + timedelta(days=1)

        parts = self.db.query(ReviewParticipant).filter(
            ReviewParticipant.company_id == self.company_id,
            ReviewParticipant.cycle_id == cycle.id,
        ).all()
        existing = {
            r.participant_id: r
            for r in self.db.query(PayrollRevision).filter(
                PayrollRevision.company_id == self.company_id,
                PayrollRevision.cycle_id == cycle.id,
            ).all()
        }

        created = 0
        for p in parts:
            if p.id in existing:
                continue
            emp = self.db.query(Employee).filter(
                Employee.id == p.employee_id, Employee.company_id == self.company_id
            ).first()
            if not emp:
                continue
            eff_score = p.adjusted_score if p.adjusted_score is not None else p.final_score
            eligible, reason = evaluate_hike_eligibility(
                emp.employment_status, emp.date_of_hire, cycle.end_date, min_tenure, eff_score
            )
            slab = pick_slab(slabs, eff_score) if (eligible and eff_score is not None) else None
            suggested_pct = Decimal(str(slab["hike_percent"])) if slab else Decimal("0.00")

            sal = self._current_salary(emp.id, cycle.end_date)
            cur_basic = sal.basic_pay if sal else None
            cur_ctc = sal.annual_ctc if sal else None
            new_basic, new_ctc = compute_hiked_pay(cur_basic, cur_ctc, suggested_pct)

            self.db.add(
                PayrollRevision(
                    company_id=self.company_id,
                    participant_id=p.id,
                    cycle_id=cycle.id,
                    employee_id=emp.id,
                    current_basic_pay=cur_basic,
                    current_annual_ctc=cur_ctc,
                    suggested_hike_percent=suggested_pct,
                    new_basic_pay=new_basic,
                    new_annual_ctc=new_ctc,
                    effective_date=default_eff_date,
                    status="suggested",
                    eligible=eligible,
                    ineligible_reason=reason,
                )
            )
            created += 1

        self.db.flush()
        if commit:
            pms_log(
                self.db,
                self.company_id,
                actor_id,
                "pms.revisions_generated",
                "review_cycle",
                cycle.id,
                cycle_id=cycle.id,
                new_value={"created": created},
            )
            self.db.commit()
        return created

    def list_revisions(self, cycle_id: UUID) -> list[dict]:
        self._cycle(cycle_id)
        rows = (
            self.db.query(PayrollRevision, ReviewParticipant, Employee)
            .join(ReviewParticipant, ReviewParticipant.id == PayrollRevision.participant_id)
            .join(Employee, Employee.id == PayrollRevision.employee_id)
            .filter(
                PayrollRevision.company_id == self.company_id,
                PayrollRevision.cycle_id == cycle_id,
            )
            .order_by(Employee.full_name)
            .all()
        )
        out = []
        for rev, part, emp in rows:
            eff_score = part.adjusted_score if part.adjusted_score is not None else part.final_score
            out.append({
                "id": rev.id,
                "cycle_id": rev.cycle_id,
                "participant_id": rev.participant_id,
                "employee_id": rev.employee_id,
                "employee_name": emp.full_name,
                "final_score": eff_score,
                "final_rating_label": part.final_rating_label,
                "eligible": rev.eligible,
                "ineligible_reason": rev.ineligible_reason,
                "current_basic_pay": rev.current_basic_pay,
                "current_annual_ctc": rev.current_annual_ctc,
                "suggested_hike_percent": rev.suggested_hike_percent,
                "approved_hike_percent": rev.approved_hike_percent,
                "override_reason": rev.override_reason,
                "new_basic_pay": rev.new_basic_pay,
                "new_annual_ctc": rev.new_annual_ctc,
                "effective_date": rev.effective_date,
                "status": rev.status,
                "approved_at": rev.approved_at,
                "salary_assignment_id": rev.salary_assignment_id,
            })
        return out

    # ── Approve / Reject ─────────────────────────────────────
    def approve_revision(
        self,
        revision_id: UUID,
        actor_id: UUID | None,
        approved_hike_percent: Decimal | None = None,
        effective_date: date | None = None,
        override_reason: str | None = None,
    ) -> PayrollRevision:
        rev = self._revision(revision_id)
        if rev.status == "applied":
            raise PmsConfigError("Revision has already been applied to payroll and cannot be modified")
        pct = (
            Decimal(str(approved_hike_percent)).quantize(TWO, rounding=ROUND_HALF_UP)
            if approved_hike_percent is not None
            else rev.suggested_hike_percent
        )
        if pct < 0 or pct > 100:
            raise PmsConfigError("Approved hike percent must be between 0 and 100")

        clean_reason = (override_reason or "").strip() or None
        if pct != rev.suggested_hike_percent and not clean_reason:
            raise PmsConfigError(
                "override_reason is required when approved_hike_percent differs from suggested_hike_percent"
            )
        if not rev.eligible and not clean_reason:
            raise PmsConfigError("override_reason is required when approving an ineligible employee")

        old_state = {
            "status": rev.status,
            "approved_hike_percent": str(rev.approved_hike_percent) if rev.approved_hike_percent is not None else None,
        }
        new_basic, new_ctc = compute_hiked_pay(rev.current_basic_pay, rev.current_annual_ctc, pct)
        rev.approved_hike_percent = pct
        rev.override_reason = clean_reason
        rev.new_basic_pay = new_basic
        rev.new_annual_ctc = new_ctc
        if effective_date is not None:
            rev.effective_date = effective_date
        rev.status = "approved"
        rev.approved_by = actor_id
        rev.approved_at = datetime.now(timezone.utc)

        cycle = self._cycle(rev.cycle_id)
        if cycle.status == "released":
            cycle.status = "payroll_approved"

        pms_log(
            self.db,
            self.company_id,
            actor_id,
            "pms.revision_approved",
            "payroll_revision",
            rev.id,
            cycle_id=rev.cycle_id,
            old_value=old_state,
            new_value={
                "status": "approved",
                "suggested_hike_percent": str(rev.suggested_hike_percent),
                "approved_hike_percent": str(pct),
                "new_basic_pay": str(new_basic) if new_basic is not None else None,
                "effective_date": str(rev.effective_date),
            },
            reason=clean_reason,
        )
        self.db.commit()
        self.db.refresh(rev)
        return rev

    def reject_revision(
        self, revision_id: UUID, actor_id: UUID | None, reason: str
    ) -> PayrollRevision:
        rev = self._revision(revision_id)
        if rev.status == "applied":
            raise PmsConfigError("Revision has already been applied to payroll and cannot be rejected")
        clean_reason = (reason or "").strip()
        if not clean_reason:
            raise PmsConfigError("A reason is required to reject a payroll revision")
        old_status = rev.status
        rev.status = "rejected"
        rev.override_reason = clean_reason
        rev.approved_by = actor_id
        rev.approved_at = datetime.now(timezone.utc)
        pms_log(
            self.db,
            self.company_id,
            actor_id,
            "pms.revision_rejected",
            "payroll_revision",
            rev.id,
            cycle_id=rev.cycle_id,
            old_value={"status": old_status},
            new_value={"status": "rejected"},
            reason=clean_reason,
        )
        self.db.commit()
        self.db.refresh(rev)
        return rev

    # ── Explicit Apply to EmployeeSalaryAssignment ───────────
    def apply_revision(self, revision_id: UUID, actor_id: UUID | None) -> PayrollRevision:
        rev = self._revision(revision_id)
        if rev.status == "applied":
            raise PmsConfigError("Revision has already been applied")
        if rev.status != "approved":
            raise PmsConfigError("Only an approved revision can be applied to payroll")
        if rev.new_basic_pay is None:
            raise PmsConfigError(
                "Employee has no base salary assignment on record; assign an initial salary before applying a hike"
            )
        if rev.effective_date is None:
            raise PmsConfigError("effective_date is required before applying a revision")

        cycle = self._cycle(rev.cycle_id)
        prev_sal = self._current_salary(rev.employee_id, cycle.end_date)
        new_assignment = EmployeeSalaryAssignment(
            company_id=self.company_id,
            employee_id=rev.employee_id,
            salary_structure_id=prev_sal.salary_structure_id if prev_sal else None,
            basic_pay=rev.new_basic_pay,
            annual_ctc=rev.new_annual_ctc,
            effective_from=rev.effective_date,
        )
        self.db.add(new_assignment)
        self.db.flush()

        rev.salary_assignment_id = new_assignment.id
        rev.status = "applied"
        pms_log(
            self.db,
            self.company_id,
            actor_id,
            "pms.revision_applied",
            "payroll_revision",
            rev.id,
            cycle_id=rev.cycle_id,
            new_value={
                "salary_assignment_id": str(new_assignment.id),
                "new_basic_pay": str(rev.new_basic_pay),
                "new_annual_ctc": str(rev.new_annual_ctc) if rev.new_annual_ctc is not None else None,
                "effective_from": str(rev.effective_date),
            },
        )
        self.db.commit()
        self.db.refresh(rev)
        return rev
