"""PMS assignment service: self/manager/peer assignments.

Peer rules: ALL colleagues in the same department (snapshot taken at launch)
are automatically assigned as peers — never the ratee, never the ratee's
manager, and never one of the ratee's direct reports. No manual selection
or swapping of peers.

Privacy: this layer knows rater identities (it must, to assign work).
Responses that reach employees must never include them.
"""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.pms import ReviewAssignment, ReviewCycle, ReviewParticipant
from app.services.pms_audit import pms_log
from app.services.pms_config_service import PmsConfigError


def eligible_department_peers(ratee: ReviewParticipant, pool: list[ReviewParticipant]) -> list[UUID]:
    """Return all colleagues in the same department, excluding self,
    ratee's manager, and ratee's direct reports."""
    if ratee.department_id is None:
        return []
    return [
        p.employee_id for p in pool
        if p.department_id == ratee.department_id
        and p.employee_id != ratee.employee_id
        and p.employee_id != ratee.manager_id
        and p.manager_id != ratee.employee_id
    ]


def snapshot_config(cycle: ReviewCycle) -> dict:
    if not cycle.config_snapshot:
        raise PmsConfigError("Cycle has not been launched")
    return cycle.config_snapshot["config"]


class PmsAssignmentService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    # ── helpers ──────────────────────────────────────────────
    def _cycle(self, cycle_id: UUID) -> ReviewCycle:
        c = self.db.query(ReviewCycle).filter(
            ReviewCycle.id == cycle_id, ReviewCycle.company_id == self.company_id).first()
        if not c:
            raise LookupError("Cycle not found")
        return c

    def _participants(self, cycle_id: UUID) -> list[ReviewParticipant]:
        return self.db.query(ReviewParticipant).filter(
            ReviewParticipant.company_id == self.company_id,
            ReviewParticipant.cycle_id == cycle_id).all()

    def _assignments(self, cycle_id: UUID) -> list[ReviewAssignment]:
        return self.db.query(ReviewAssignment).filter(
            ReviewAssignment.company_id == self.company_id,
            ReviewAssignment.cycle_id == cycle_id).all()

    def _add(self, cycle_id, ratee_id, rater_id, rater_type, assigned_by) -> ReviewAssignment:
        a = ReviewAssignment(
            company_id=self.company_id, cycle_id=cycle_id, ratee_id=ratee_id,
            rater_id=rater_id, rater_type=rater_type, status="pending",
            assigned_by=assigned_by)
        self.db.add(a)
        return a

    def _participant(self, cycle_id: UUID, employee_id: UUID) -> ReviewParticipant:
        p = self.db.query(ReviewParticipant).filter(
            ReviewParticipant.company_id == self.company_id,
            ReviewParticipant.cycle_id == cycle_id,
            ReviewParticipant.employee_id == employee_id).first()
        if not p:
            raise LookupError("Employee is not enrolled in this cycle")
        return p

    # ── bulk generation (called when a cycle enters 'rating') ─
    def generate_all(self, cycle: ReviewCycle) -> dict:
        snapshot_config(cycle)
        parts = self._participants(cycle.id)
        existing = self._assignments(cycle.id)
        have = {(a.ratee_id, a.rater_id) for a in existing}

        counts = {"self": 0, "manager": 0, "peer": 0, "no_manager": 0}
        for p in parts:
            if (p.employee_id, p.employee_id) not in have:
                self._add(cycle.id, p.employee_id, p.employee_id, "self", "system")
                have.add((p.employee_id, p.employee_id))
                counts["self"] += 1
            if p.manager_id and p.manager_id != p.employee_id:
                if (p.employee_id, p.manager_id) not in have:
                    self._add(cycle.id, p.employee_id, p.manager_id, "manager", "system")
                    have.add((p.employee_id, p.manager_id))
                    counts["manager"] += 1
            else:
                counts["no_manager"] += 1

            # All eligible colleagues in the same department rate each other
            for rater_id in eligible_department_peers(p, parts):
                if (p.employee_id, rater_id) not in have:
                    self._add(cycle.id, p.employee_id, rater_id, "peer", "system")
                    have.add((p.employee_id, rater_id))
                    counts["peer"] += 1

        self.db.flush()
        pms_log(self.db, self.company_id, None, "pms.assignments_generated", "review_cycle",
                cycle.id, cycle_id=cycle.id, new_value=counts)
        return counts

    def set_reviewer(self, cycle_id: UUID, ratee_id: UUID, reviewer_id: UUID, actor_id) -> None:
        """Admin designates (or replaces) the manager-type reviewer, e.g. for
        employees without a manager."""
        cycle = self._cycle(cycle_id)
        if cycle.status not in ("goal_setting", "rating"):
            raise PmsConfigError("Reviewer can only be changed during goal setting or rating")
        ratee = self._participant(cycle_id, ratee_id)
        if reviewer_id == ratee_id:
            raise PmsConfigError("Reviewer cannot be the employee themselves")
        if not self.db.query(Employee).filter(
                Employee.id == reviewer_id, Employee.company_id == self.company_id).first():
            raise LookupError("Reviewer not found")
        old = ratee.manager_id
        ratee.manager_id = reviewer_id
        if cycle.status == "rating":
            existing = self.db.query(ReviewAssignment).filter(
                ReviewAssignment.cycle_id == cycle_id, ReviewAssignment.ratee_id == ratee_id,
                ReviewAssignment.rater_type == "manager").all()
            if any(a.status == "submitted" and a.rater_id != reviewer_id for a in existing):
                raise PmsConfigError("A manager rating was already submitted for this employee")
            for a in existing:
                if a.rater_id != reviewer_id:
                    self.db.delete(a)
            if not any(a.rater_id == reviewer_id for a in existing):
                clash = self.db.query(ReviewAssignment).filter(
                    ReviewAssignment.cycle_id == cycle_id, ReviewAssignment.ratee_id == ratee_id,
                    ReviewAssignment.rater_id == reviewer_id).first()
                if clash and clash.status == "submitted":
                    raise PmsConfigError("Reviewer has already submitted a peer rating for this employee")
                if clash:
                    self.db.delete(clash)
                self._add(cycle_id, ratee_id, reviewer_id, "manager", "admin")
        pms_log(self.db, self.company_id, actor_id, "pms.reviewer_set", "review_participant",
                ratee.id, cycle_id=cycle_id,
                old_value={"manager_id": str(old) if old else None},
                new_value={"manager_id": str(reviewer_id)})
        self.db.commit()
