"""PMS cycle service: create, launch (config snapshot + enrolment), advance.

State machine (Phase 2 covers the first three transitions; finalize /
release / payroll steps arrive with later phases):
    draft -> goal_setting -> rating -> review -> finalized -> released
          -> payroll_approved -> closed
"""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models.employee import Employee
from app.models.pms import Goal, ReviewCycle, ReviewParticipant
from app.services.pms_audit import pms_log
from app.services.pms_config_service import (
    PmsConfigError, PmsConfigService, _config_dict, _jsonable, find_slab_overlap,
)

ACTIVE_STATES = ("goal_setting", "rating", "review")
ADVANCE_TO = {"goal_setting": "rating", "rating": "review"}
EXCLUDED_EMPLOYMENT_TYPES = ("contractor",)


def next_status(current: str) -> str:
    try:
        return ADVANCE_TO[current]
    except KeyError:
        raise PmsConfigError(f"Cycle cannot be advanced from '{current}'")


class PmsCycleService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    def get_cycle(self, cycle_id: UUID) -> ReviewCycle:
        c = self.db.query(ReviewCycle).filter(
            ReviewCycle.id == cycle_id, ReviewCycle.company_id == self.company_id).first()
        if not c:
            raise LookupError("Cycle not found")
        return c

    def list_cycles(self, include_draft: bool) -> list[ReviewCycle]:
        q = self.db.query(ReviewCycle).filter(ReviewCycle.company_id == self.company_id)
        if not include_draft:
            q = q.filter(ReviewCycle.status != "draft")
        return q.order_by(ReviewCycle.start_date.desc()).all()

    def create_cycle(self, actor_id, data: dict) -> ReviewCycle:
        c = ReviewCycle(company_id=self.company_id, status="draft", created_by=actor_id, **data)
        self.db.add(c)
        self.db.flush()
        pms_log(self.db, self.company_id, actor_id, "pms.cycle_created", "review_cycle", c.id,
                cycle_id=c.id, new_value={"name": c.name, "start": str(c.start_date),
                                          "end": str(c.end_date)})
        self.db.commit()
        self.db.refresh(c)
        return c

    def delete_draft(self, actor_id, cycle_id: UUID) -> None:
        c = self.get_cycle(cycle_id)
        if c.status != "draft":
            raise PmsConfigError("Only draft cycles can be deleted")
        pms_log(self.db, self.company_id, actor_id, "pms.cycle_deleted", "review_cycle", c.id,
                old_value={"name": c.name})
        self.db.delete(c)
        self.db.commit()

    # ── launch ───────────────────────────────────────────────
    def _build_snapshot(self) -> dict:
        cfg_svc = PmsConfigService(self.db, self.company_id)
        cfg = cfg_svc.get_config()
        params = cfg_svc.list_parameters()
        slabs = cfg_svc.list_slabs()
        if not params:
            raise PmsConfigError("At least one active competency parameter is required")
        if not slabs:
            raise PmsConfigError("At least one rating slab is required")
        if find_slab_overlap([(s.min_score, s.max_score) for s in slabs]):
            raise PmsConfigError("Rating slabs overlap; fix them before launching")
        return {
            "config": _jsonable(_config_dict(cfg)),
            "parameters": [{"id": str(p.id), "name": p.name, "display_order": p.display_order}
                           for p in params],
            "slabs": [{"label": s.label, "min_score": str(s.min_score),
                       "max_score": str(s.max_score), "hike_percent": str(s.hike_percent)}
                      for s in slabs],
        }

    def launch(self, actor_id, cycle_id: UUID) -> ReviewCycle:
        c = self.get_cycle(cycle_id)
        if c.status != "draft":
            raise PmsConfigError("Only a draft cycle can be launched")
        running = self.db.query(ReviewCycle).filter(
            ReviewCycle.company_id == self.company_id, ReviewCycle.id != c.id,
            ReviewCycle.status.in_(ACTIVE_STATES)).first()
        if running:
            raise PmsConfigError(f"Cycle '{running.name}' is still in progress")

        employees = self.db.query(Employee).filter(
            Employee.company_id == self.company_id,
            Employee.employment_status == "active",
            Employee.employment_type.notin_(EXCLUDED_EMPLOYMENT_TYPES),
            Employee.date_of_hire <= c.end_date).all()
        if not employees:
            raise PmsConfigError("No eligible employees to enrol")

        c.config_snapshot = self._build_snapshot()
        for e in employees:
            self.db.add(ReviewParticipant(
                company_id=self.company_id, cycle_id=c.id, employee_id=e.id,
                manager_id=e.manager_id, department_id=e.department_id,
                designation_id=e.designation_id, status="pending"))
        c.status = "goal_setting"
        c.launched_at = datetime.now(timezone.utc)
        pms_log(self.db, self.company_id, actor_id, "pms.cycle_launched", "review_cycle", c.id,
                cycle_id=c.id, new_value={"participants": len(employees)})
        self.db.commit()
        self.db.refresh(c)
        return c

    # ── advance ──────────────────────────────────────────────
    def _guard_goal_setting_exit(self, cycle: ReviewCycle) -> None:
        goals = self.db.query(Goal).filter(
            Goal.company_id == self.company_id, Goal.cycle_id == cycle.id).all()
        if any(g.status == "pending_approval" for g in goals):
            raise PmsConfigError("Some goals are still pending manager approval")
        totals: dict = {}
        for g in goals:
            if g.status in ("approved", "locked"):
                totals[g.employee_id] = totals.get(g.employee_id, Decimal("0")) + g.weight
        bad = [eid for eid, t in totals.items() if t != 100]
        if bad:
            raise PmsConfigError(
                f"{len(bad)} employee(s) have approved goal weights that do not sum to 100")

    def advance(self, actor_id, cycle_id: UUID) -> ReviewCycle:
        c = self.get_cycle(cycle_id)
        target = next_status(c.status)
        if c.status == "goal_setting":
            self._guard_goal_setting_exit(c)
            for g in self.db.query(Goal).filter(
                    Goal.company_id == self.company_id, Goal.cycle_id == c.id,
                    Goal.status == "approved").all():
                g.status = "locked"
        old = c.status
        c.status = target
        summary: dict = {}
        if target == "rating":
            from app.services.pms_assignment_service import PmsAssignmentService
            summary = PmsAssignmentService(self.db, self.company_id).generate_all(c)
        elif target == "review":
            from app.services.pms_rating_service import PmsRatingService
            summary = {"scored": PmsRatingService(self.db, self.company_id).compute_all(c)}
        pms_log(self.db, self.company_id, actor_id, "pms.cycle_advanced", "review_cycle", c.id,
                cycle_id=c.id, old_value={"status": old}, new_value={"status": target, **summary})
        self.db.commit()
        self.db.refresh(c)
        return c

    # ── participants ─────────────────────────────────────────
    def list_participants(self, cycle_id: UUID, actor_id, is_admin) -> list[ReviewParticipant]:
        self.get_cycle(cycle_id)
        q = (self.db.query(ReviewParticipant).options(joinedload(ReviewParticipant.employee))
             .filter(ReviewParticipant.company_id == self.company_id,
                     ReviewParticipant.cycle_id == cycle_id))
        if not is_admin:
            if not actor_id:
                raise PermissionError("Not allowed")
            q = q.filter(ReviewParticipant.manager_id == actor_id)
        return q.all()
