"""Yearly appraisal: average of monthly scores, feeding the existing
finalize -> release -> payroll revision flow."""

from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models.employee import Employee
from app.models.pms import ReviewCycle, ReviewParticipant
from app.services.pms_audit import pms_log
from app.services.pms_config_service import (
    EXCLUDED_EMPLOYMENT_TYPES, PmsConfigError, PmsConfigService, pick_slab,
)
from app.services.pms_monthly_service import (
    PmsMonthlyService, add_months, month_end, month_key, today_ist,
)
from app.services.pms_results_service import RELEASED_CYCLE_STATES, effective_score_of
from app.services.pms_scoring import mean, q2


class PmsAppraisalService:
    def __init__(self, db: Session, company_id: UUID, today: date | None = None):
        self.db = db
        self.company_id = company_id
        self.today = today or today_ist()

    def get(self, cycle_id: UUID) -> ReviewCycle:
        c = self.db.query(ReviewCycle).filter(
            ReviewCycle.id == cycle_id, ReviewCycle.company_id == self.company_id,
            ReviewCycle.period_type == "appraisal").first()
        if not c:
            raise LookupError("Appraisal not found")
        return c

    def list_all(self) -> list[ReviewCycle]:
        return self.db.query(ReviewCycle).filter(
            ReviewCycle.company_id == self.company_id,
            ReviewCycle.period_type == "appraisal").order_by(ReviewCycle.end_date.desc()).all()

    def create(self, actor_id, first: date, last: date, min_months: int) -> ReviewCycle:
        if last < first:
            raise PmsConfigError("The last month must not be before the first month")
        if last > add_months(first, 11):
            raise PmsConfigError("An appraisal can cover at most 12 months")
        if last > self.today.replace(day=1):
            raise PmsConfigError("An appraisal cannot cover future months")
        span = (last.year - first.year) * 12 + last.month - first.month + 1
        if min_months > span:
            raise PmsConfigError("Minimum months cannot exceed the months in the appraisal")
        # A month may only ever count towards one hike.
        clash = self.db.query(ReviewCycle).filter(
            ReviewCycle.company_id == self.company_id,
            ReviewCycle.period_type == "appraisal",
            ReviewCycle.start_date <= month_end(last), ReviewCycle.end_date >= first).first()
        if clash:
            raise PmsConfigError(f"These months overlap with '{clash.name}'")

        snap = PmsConfigService(self.db, self.company_id).build_snapshot()
        snap["config"]["min_months_for_hike"] = min_months
        c = ReviewCycle(
            company_id=self.company_id, period_type="appraisal", status="review",
            name=f"Appraisal {first:%b %Y} - {last:%b %Y}", start_date=first,
            end_date=month_end(last), config_snapshot=snap, created_by=actor_id,
            launched_at=datetime.now(timezone.utc))
        self.db.add(c)
        self.db.flush()
        for e in self.db.query(Employee).filter(
                Employee.company_id == self.company_id,
                Employee.employment_status == "active",
                Employee.employment_type.notin_(EXCLUDED_EMPLOYMENT_TYPES),
                Employee.date_of_hire <= c.end_date).all():
            self.db.add(ReviewParticipant(
                company_id=self.company_id, cycle_id=c.id, employee_id=e.id,
                manager_id=e.manager_id, department_id=e.department_id,
                designation_id=e.designation_id, status="pending"))
        self.db.flush()
        self.refresh_scores(c)
        pms_log(self.db, self.company_id, actor_id, "pms.appraisal_created", "review_cycle", c.id,
                cycle_id=c.id, new_value={"name": c.name, "min_months": min_months})
        self.db.commit()
        return c

    def delete(self, actor_id, cycle_id: UUID) -> None:
        c = self.get(cycle_id)
        if c.status != "review":
            raise PmsConfigError("A finalized appraisal cannot be deleted")
        pms_log(self.db, self.company_id, actor_id, "pms.appraisal_deleted", "review_cycle", c.id,
                old_value={"name": c.name})
        self.db.delete(c)
        self.db.commit()

    def refresh_scores(self, c: ReviewCycle) -> None:
        """Recompute averages until finalized. Manual adjustments are kept."""
        if c.status != "review":
            return
        monthly = PmsMonthlyService(self.db, self.company_id, self.today)
        for p in self.db.query(ReviewParticipant).filter(
                ReviewParticipant.cycle_id == c.id, ReviewParticipant.locked_at.is_(None)).all():
            rows = monthly.scores(p.employee_id, c.start_date, c.end_date)
            avg = mean([r.final_score for r, _ in rows])
            p.final_score = q2(avg) if avg is not None else None
            p.months_reviewed = len(rows)
            p.parameter_breakdown = [
                {"month": month_key(m.start_date), "score": str(r.final_score)} for r, m in rows]
            eff = effective_score_of(p)
            slab = pick_slab(c.config_snapshot["slabs"], eff) if eff is not None else None
            p.final_rating_label = slab["label"] if slab else None
        self.db.flush()

    def detail(self, cycle_id: UUID) -> dict:
        c = self.get(cycle_id)
        self.refresh_scores(c)
        self.db.commit()
        parts = self.db.query(ReviewParticipant).options(
            joinedload(ReviewParticipant.employee)).filter(
            ReviewParticipant.cycle_id == c.id).all()
        people = [{
            "employee_id": p.employee_id,
            "employee_name": p.employee.full_name if p.employee else "",
            "average": p.final_score, "adjusted_score": p.adjusted_score,
            "adjustment_reason": p.adjustment_reason, "score": effective_score_of(p),
            "label": p.final_rating_label, "months_reviewed": p.months_reviewed or 0,
        } for p in parts]
        return {"id": c.id, "name": c.name, "status": c.status,
                "min_months": c.config_snapshot["config"]["min_months_for_hike"],
                "people": sorted(people, key=lambda x: x["employee_name"].lower())}

    def mine(self, actor_id) -> list[dict]:
        """Released appraisals only."""
        if not actor_id:
            return []
        rows = (self.db.query(ReviewParticipant, ReviewCycle)
                .join(ReviewCycle, ReviewCycle.id == ReviewParticipant.cycle_id)
                .filter(ReviewParticipant.company_id == self.company_id,
                        ReviewParticipant.employee_id == actor_id,
                        ReviewCycle.period_type == "appraisal",
                        ReviewCycle.status.in_(RELEASED_CYCLE_STATES))
                .order_by(ReviewCycle.end_date.desc()).all())
        return [{"id": c.id, "name": c.name, "score": effective_score_of(p),
                 "label": p.final_rating_label, "months_reviewed": p.months_reviewed or 0}
                for p, c in rows]
