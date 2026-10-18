"""PMS rating service: rater tasks, rating submission, score computation.

Privacy rules enforced here:
  * A rater only ever sees their own assignments.
  * Peer submissions are audited with no actor, so neither the audit log
    nor any admin view can tie a peer to a rating.
  * Completion/progress views report counts for peers, never names.
"""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models.employee import Employee
from app.models.pms import (
    Goal, Rating, ReviewAssignment, ReviewCycle, ReviewParticipant,
)
from app.services.pms_audit import pms_log
from app.services.pms_config_service import PmsConfigError, pick_slab
from app.services.pms_goal_service import compute_goals_score
from app.services.pms_scoring import compute_competency, compute_final_score


def _decimals(cfg: dict) -> dict:
    out = {}
    for k, v in cfg.items():
        if isinstance(v, str):
            try:
                out[k] = Decimal(v)
                continue
            except Exception:
                pass
        out[k] = v
    return out


class PmsRatingService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    def _cycle(self, cycle_id: UUID) -> ReviewCycle:
        c = self.db.query(ReviewCycle).filter(
            ReviewCycle.id == cycle_id, ReviewCycle.company_id == self.company_id).first()
        if not c:
            raise LookupError("Cycle not found")
        return c

    # ── rater tasks ──────────────────────────────────────────
    def my_tasks(self, actor_id: UUID | None) -> list[dict]:
        if not actor_id:
            return []
        rows = (self.db.query(ReviewAssignment, ReviewCycle, Employee)
                .join(ReviewCycle, ReviewCycle.id == ReviewAssignment.cycle_id)
                .join(Employee, Employee.id == ReviewAssignment.ratee_id)
                .filter(ReviewAssignment.company_id == self.company_id,
                        ReviewAssignment.rater_id == actor_id,
                        ReviewCycle.status == "rating")
                .order_by(ReviewAssignment.rater_type, Employee.full_name).all())
        return [{
            "id": a.id, "cycle_id": c.id, "cycle_name": c.name, "ratee_id": a.ratee_id,
            "ratee_name": e.full_name, "rater_type": a.rater_type, "status": a.status,
        } for a, c, e in rows]

    def _own_assignment(self, assignment_id: UUID, actor_id) -> ReviewAssignment:
        a = self.db.query(ReviewAssignment).filter(
            ReviewAssignment.id == assignment_id,
            ReviewAssignment.company_id == self.company_id).first()
        # 404 (not 403) for someone else's assignment: do not confirm it exists.
        if not a or not actor_id or a.rater_id != actor_id:
            raise LookupError("Assignment not found")
        return a

    def task_detail(self, assignment_id: UUID, actor_id) -> dict:
        a = self._own_assignment(assignment_id, actor_id)
        cycle = self._cycle(a.cycle_id)
        ratee = self.db.query(Employee).filter(Employee.id == a.ratee_id).first()
        return {
            "id": a.id, "cycle_id": cycle.id, "cycle_name": cycle.name,
            "ratee_id": a.ratee_id, "ratee_name": ratee.full_name if ratee else "",
            "rater_type": a.rater_type, "status": a.status,
            "parameters": cycle.config_snapshot["parameters"] if cycle.config_snapshot else [],
        }

    def submit(self, assignment_id: UUID, actor_id, items: list[dict]) -> ReviewAssignment:
        a = self._own_assignment(assignment_id, actor_id)
        cycle = self._cycle(a.cycle_id)
        if cycle.status != "rating":
            raise PmsConfigError("Ratings are not open for this cycle")
        if a.status != "pending":
            raise PmsConfigError("This review has already been submitted")
        part = self.db.query(ReviewParticipant).filter(
            ReviewParticipant.cycle_id == cycle.id,
            ReviewParticipant.employee_id == a.ratee_id).first()
        if part and part.locked_at:
            raise PmsConfigError("Ratings are locked for this employee")

        required = {p["id"] for p in cycle.config_snapshot["parameters"]}
        given = [str(i["parameter_id"]) for i in items]
        if len(set(given)) != len(given):
            raise PmsConfigError("Duplicate parameters in submission")
        if set(given) != required:
            raise PmsConfigError("A score is required for every competency parameter")

        for i in items:
            self.db.add(Rating(
                company_id=self.company_id, assignment_id=a.id,
                parameter_id=i["parameter_id"], cycle_id=a.cycle_id, ratee_id=a.ratee_id,
                rater_type=a.rater_type, score=i["score"], comment=i.get("comment")))
        a.status = "submitted"
        a.submitted_at = datetime.now(timezone.utc)
        pms_log(self.db, self.company_id,
                None if a.rater_type == "peer" else actor_id,
                "pms.rating_submitted", "review_assignment", a.id, cycle_id=a.cycle_id,
                new_value={"rater_type": a.rater_type, "ratee_id": str(a.ratee_id)})
        self.db.commit()
        self.db.refresh(a)
        return a

    # ── admin completion view (no peer identities) ───────────
    def completion(self, cycle_id: UUID) -> list[dict]:
        self._cycle(cycle_id)
        parts = (self.db.query(ReviewParticipant).options(joinedload(ReviewParticipant.employee))
                 .filter(ReviewParticipant.company_id == self.company_id,
                         ReviewParticipant.cycle_id == cycle_id).all())
        assigns = self.db.query(ReviewAssignment).filter(
            ReviewAssignment.company_id == self.company_id,
            ReviewAssignment.cycle_id == cycle_id).all()
        by_ratee: dict = {}
        for a in assigns:
            by_ratee.setdefault(a.ratee_id, []).append(a)
        out = []
        for p in parts:
            rows = by_ratee.get(p.employee_id, [])
            peers = [a for a in rows if a.rater_type == "peer"]
            def st(t):
                x = [a for a in rows if a.rater_type == t]
                return x[0].status if x else "none"
            out.append({
                "employee_id": p.employee_id,
                "employee_name": p.employee.full_name if p.employee else None,
                "self_status": st("self"), "manager_status": st("manager"),
                "peers_assigned": len(peers),
                "peers_submitted": sum(1 for a in peers if a.status == "submitted"),
            })
        return out

    # ── scoring ──────────────────────────────────────────────
    def compute_participant(self, cycle: ReviewCycle, part: ReviewParticipant) -> ReviewParticipant:
        if part.locked_at:
            raise PmsConfigError("Ratings are locked for this employee")
        snap = cycle.config_snapshot
        cfg = _decimals(snap["config"])
        names = {p["id"]: p["name"] for p in snap["parameters"]}

        grouped: dict = {pid: {"self": [], "manager": [], "peer": []} for pid in names}
        for r in self.db.query(Rating).filter(
                Rating.cycle_id == cycle.id, Rating.ratee_id == part.employee_id).all():
            grouped.setdefault(str(r.parameter_id), {"self": [], "manager": [], "peer": []})[
                r.rater_type].append(r.score)

        assigns = self.db.query(ReviewAssignment).filter(
            ReviewAssignment.cycle_id == cycle.id,
            ReviewAssignment.ratee_id == part.employee_id).all()
        peer_submitted = sum(1 for a in assigns if a.rater_type == "peer" and a.status == "submitted")

        comp = compute_competency(grouped, names, peer_submitted, cfg)

        goals = self.db.query(Goal).filter(
            Goal.cycle_id == cycle.id, Goal.employee_id == part.employee_id,
            Goal.status.in_(("approved", "locked"))).all()
        goals_score = compute_goals_score(
            [(g.weight, g.final_achievement_pct) for g in goals],
            cap=Decimal(str(cfg["goal_achievement_cap"])),
            scale_max=Decimal(str(cfg["rating_scale_max"])))

        final = compute_final_score(
            {"goals": goals_score, "competency": comp["competency_score"],
             "discipline": None, "growth": None},
            {"goals": cfg["weight_goals"], "competency": cfg["weight_competency"],
             "discipline": cfg["weight_discipline"], "growth": cfg["weight_growth"]},
            Decimal(str(cfg["rating_scale_max"])))

        slab = pick_slab(snap["slabs"], final) if final is not None else None

        part.goals_score = goals_score
        part.competency_score = comp["competency_score"]
        part.self_avg = comp["self_avg"]
        part.manager_avg = comp["manager_avg"]
        part.peer_avg = comp["peer_avg"]
        part.peer_response_count = peer_submitted
        part.peer_score_insufficient = comp["peer_score_insufficient"]
        part.parameter_breakdown = comp["breakdown"]
        part.final_score = final
        part.final_rating_label = slab["label"] if slab else None
        from app.services.pms_results_service import PmsResultsService
        part.attendance_snapshot = PmsResultsService(
            self.db, self.company_id
        ).build_attendance_snapshot(cycle, part.employee_id)
        manager_done = any(a.rater_type == "manager" and a.status == "submitted" for a in assigns)
        any_done = any(a.status == "submitted" for a in assigns)
        part.status = "submitted" if manager_done else ("in_progress" if any_done else "pending")
        return part

    def compute_all(self, cycle: ReviewCycle) -> int:
        parts = self.db.query(ReviewParticipant).filter(
            ReviewParticipant.company_id == self.company_id,
            ReviewParticipant.cycle_id == cycle.id,
            ReviewParticipant.locked_at.is_(None)).all()
        for p in parts:
            self.compute_participant(cycle, p)
        self.db.flush()
        return len(parts)

    def recompute(self, actor_id, cycle_id: UUID) -> int:
        cycle = self._cycle(cycle_id)
        if cycle.status not in ("rating", "review"):
            raise PmsConfigError("Scores can only be computed during rating or review")
        n = self.compute_all(cycle)
        pms_log(self.db, self.company_id, actor_id, "pms.scores_computed", "review_cycle",
                cycle.id, cycle_id=cycle.id, new_value={"participants": n})
        self.db.commit()
        return n

    def list_scores(self, cycle_id: UUID) -> list[ReviewParticipant]:
        self._cycle(cycle_id)
        return (self.db.query(ReviewParticipant).options(joinedload(ReviewParticipant.employee))
                .filter(ReviewParticipant.company_id == self.company_id,
                        ReviewParticipant.cycle_id == cycle_id).all())
