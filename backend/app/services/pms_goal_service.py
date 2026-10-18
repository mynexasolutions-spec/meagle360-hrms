"""PMS goal service: goals, progress, weight validation, approval, KPI templates.

Pure helpers (achievement_pct, compute_goals_score) are module-level for
unit testing and reuse by the scoring engine.

Access model (resolved per call from actor_employee_id / is_admin):
  - employee: creates/edits/deletes own goals while they are 'draft',
    submits them for approval, records progress.
  - manager of the employee: creates goals (auto-approved), edits any
    non-locked goal, approves/returns submissions, records progress.
  - admin: same powers as a manager over everyone.
Definition changes only while the cycle is in 'goal_setting'.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models.employee import Employee
from app.models.pms import Goal, GoalProgress, KpiTemplate, ReviewCycle, ReviewParticipant
from app.services.pms_audit import pms_log
from app.services.pms_config_service import PmsConfigError

TWO = Decimal("0.01")
LOWER_BETTER_ZERO_ACTUAL = Decimal("200")
PROGRESS_STATUSES = ("goal_setting", "rating", "review")


# ── Pure helpers ─────────────────────────────────────────────

def achievement_pct(actual: Decimal, target: Decimal, direction: str) -> Decimal:
    """Uncapped achievement %. lower_better: target/actual (0 actual = 200%)."""
    actual, target = Decimal(str(actual)), Decimal(str(target))
    if target <= 0:
        raise PmsConfigError("Target must be greater than zero")
    if direction == "lower_better":
        pct = LOWER_BETTER_ZERO_ACTUAL if actual <= 0 else target / actual * 100
    else:
        pct = actual / target * 100
    return pct.quantize(TWO, rounding=ROUND_HALF_UP)


def compute_goals_score(goals: list[tuple[Decimal, Decimal | None]],
                        cap: Decimal = Decimal("120"),
                        scale_max: Decimal = Decimal("5")) -> Decimal | None:
    """goals: [(weight, achievement_pct or None)]. None counts as 0%.
    Each achievement is capped at `cap`, weighted-averaged, mapped to the
    rating scale (100% -> scale_max) and clamped to scale_max. None when
    there are no goals."""
    if not goals:
        return None
    total_w = sum(Decimal(str(w)) for w, _ in goals)
    if total_w <= 0:
        return None
    acc = sum(
        Decimal(str(w)) * min(Decimal(str(a if a is not None else 0)), cap) / 100
        for w, a in goals)
    score = acc / total_w * scale_max
    return min(score, scale_max).quantize(TWO, rounding=ROUND_HALF_UP)


def _goal_snapshot(g: Goal) -> dict:
    return {"title": g.title, "weight": str(g.weight), "target_value": str(g.target_value),
            "direction": g.direction, "status": g.status}


class PmsGoalService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    # ── lookups / guards ─────────────────────────────────────
    def _cycle(self, cycle_id: UUID) -> ReviewCycle:
        c = self.db.query(ReviewCycle).filter(
            ReviewCycle.id == cycle_id, ReviewCycle.company_id == self.company_id).first()
        if not c:
            raise LookupError("Cycle not found")
        return c

    def _participant(self, cycle_id: UUID, employee_id: UUID) -> ReviewParticipant:
        p = self.db.query(ReviewParticipant).filter(
            ReviewParticipant.cycle_id == cycle_id,
            ReviewParticipant.employee_id == employee_id,
            ReviewParticipant.company_id == self.company_id).first()
        if not p:
            raise LookupError("Employee is not enrolled in this cycle")
        return p

    def _employee(self, employee_id: UUID) -> Employee:
        e = self.db.query(Employee).filter(
            Employee.id == employee_id, Employee.company_id == self.company_id).first()
        if not e:
            raise LookupError("Employee not found")
        return e

    def _is_manager_of(self, actor_id: UUID | None, employee_id: UUID) -> bool:
        if not actor_id:
            return False
        e = self._employee(employee_id)
        return e.manager_id == actor_id

    def _can_oversee(self, actor_id, is_admin, employee_id) -> bool:
        return bool(is_admin or self._is_manager_of(actor_id, employee_id))

    def _can_view(self, actor_id, is_admin, employee_id) -> bool:
        return actor_id == employee_id or self._can_oversee(actor_id, is_admin, employee_id)

    def _goal(self, goal_id: UUID) -> Goal:
        g = self.db.query(Goal).options(joinedload(Goal.progress)).filter(
            Goal.id == goal_id, Goal.company_id == self.company_id).first()
        if not g:
            raise LookupError("Goal not found")
        return g

    def _weight_total(self, cycle_id: UUID, employee_id: UUID,
                      exclude_goal_id: UUID | None = None) -> Decimal:
        q = self.db.query(Goal).filter(
            Goal.company_id == self.company_id, Goal.cycle_id == cycle_id,
            Goal.employee_id == employee_id)
        if exclude_goal_id:
            q = q.filter(Goal.id != exclude_goal_id)
        return sum((g.weight for g in q.all()), Decimal("0"))

    def _require_goal_setting(self, cycle: ReviewCycle) -> None:
        if cycle.status != "goal_setting":
            raise PmsConfigError("Goals can only be changed while the cycle is in goal setting")

    # ── read ─────────────────────────────────────────────────
    def list_goals(self, cycle_id: UUID, employee_id: UUID, actor_id, is_admin) -> list[Goal]:
        self._cycle(cycle_id)
        if not self._can_view(actor_id, is_admin, employee_id):
            raise PermissionError("Not allowed to view these goals")
        return (self.db.query(Goal).options(joinedload(Goal.progress))
                .filter(Goal.company_id == self.company_id, Goal.cycle_id == cycle_id,
                        Goal.employee_id == employee_id)
                .order_by(Goal.created_at).all())

    # ── create / edit / delete ───────────────────────────────
    def create_goal(self, cycle_id: UUID, actor_id, is_admin, data: dict) -> Goal:
        cycle = self._cycle(cycle_id)
        self._require_goal_setting(cycle)
        employee_id = data.pop("employee_id", None) or actor_id
        if not employee_id:
            raise PmsConfigError("employee_id is required")
        self._participant(cycle_id, employee_id)
        oversee = self._can_oversee(actor_id, is_admin, employee_id)
        if employee_id != actor_id and not oversee:
            raise PermissionError("Not allowed to create goals for this employee")
        if self._weight_total(cycle_id, employee_id) + Decimal(str(data["weight"])) > 100:
            raise PmsConfigError("Total goal weight for the employee cannot exceed 100")
        g = Goal(company_id=self.company_id, cycle_id=cycle_id, employee_id=employee_id,
                 status="approved" if (oversee and employee_id != actor_id) else "draft",
                 approved_by=actor_id if (oversee and employee_id != actor_id) else None,
                 **data)
        self.db.add(g)
        self.db.flush()
        pms_log(self.db, self.company_id, actor_id, "pms.goal_created", "goal", g.id,
                cycle_id=cycle_id, new_value=_goal_snapshot(g))
        self.db.commit()
        self.db.refresh(g)
        return g

    def _check_editable(self, g: Goal, actor_id, is_admin) -> None:
        self._require_goal_setting(self._cycle(g.cycle_id))
        if g.status == "locked":
            raise PmsConfigError("Goal is locked")
        if self._can_oversee(actor_id, is_admin, g.employee_id):
            return
        if actor_id == g.employee_id and g.status == "draft":
            return
        raise PermissionError("Not allowed to modify this goal")

    def update_goal(self, goal_id: UUID, actor_id, is_admin, changes: dict) -> Goal:
        g = self._goal(goal_id)
        self._check_editable(g, actor_id, is_admin)
        changes = {k: v for k, v in changes.items() if v is not None}
        if "weight" in changes and (
                self._weight_total(g.cycle_id, g.employee_id, exclude_goal_id=g.id)
                + Decimal(str(changes["weight"])) > 100):
            raise PmsConfigError("Total goal weight for the employee cannot exceed 100")
        old = _goal_snapshot(g)
        for k, v in changes.items():
            setattr(g, k, v)
        if "target_value" in changes or "direction" in changes:
            self._refresh_final_achievement(g)
        pms_log(self.db, self.company_id, actor_id, "pms.goal_updated", "goal", g.id,
                cycle_id=g.cycle_id, old_value=old, new_value=_goal_snapshot(g))
        self.db.commit()
        self.db.refresh(g)
        return g

    def delete_goal(self, goal_id: UUID, actor_id, is_admin) -> None:
        g = self._goal(goal_id)
        self._check_editable(g, actor_id, is_admin)
        pms_log(self.db, self.company_id, actor_id, "pms.goal_deleted", "goal", g.id,
                cycle_id=g.cycle_id, old_value=_goal_snapshot(g))
        self.db.delete(g)
        self.db.commit()

    # ── submit / approve / return ────────────────────────────
    def submit_goals(self, cycle_id: UUID, actor_id) -> int:
        cycle = self._cycle(cycle_id)
        self._require_goal_setting(cycle)
        if not actor_id:
            raise PmsConfigError("No employee record linked to this account")
        self._participant(cycle_id, actor_id)
        goals = self.db.query(Goal).filter(
            Goal.company_id == self.company_id, Goal.cycle_id == cycle_id,
            Goal.employee_id == actor_id).all()
        drafts = [g for g in goals if g.status == "draft"]
        if not drafts:
            raise PmsConfigError("No draft goals to submit")
        total = sum((g.weight for g in goals), Decimal("0"))
        if total != 100:
            raise PmsConfigError(f"Goal weights must sum to 100 (currently {total})")
        for g in drafts:
            g.status = "pending_approval"
        pms_log(self.db, self.company_id, actor_id, "pms.goals_submitted", "goal", None,
                cycle_id=cycle_id, new_value={"employee_id": str(actor_id), "count": len(drafts)})
        self.db.commit()
        return len(drafts)

    def approve_goals(self, cycle_id: UUID, employee_id: UUID, actor_id, is_admin) -> int:
        cycle = self._cycle(cycle_id)
        self._require_goal_setting(cycle)
        if not self._can_oversee(actor_id, is_admin, employee_id):
            raise PermissionError("Only the manager or an admin can approve goals")
        goals = self.db.query(Goal).filter(
            Goal.company_id == self.company_id, Goal.cycle_id == cycle_id,
            Goal.employee_id == employee_id).all()
        pending = [g for g in goals if g.status == "pending_approval"]
        if not pending:
            raise PmsConfigError("No goals pending approval")
        total = sum((g.weight for g in goals), Decimal("0"))
        if total != 100:
            raise PmsConfigError(f"Goal weights must sum to 100 (currently {total})")
        for g in pending:
            g.status = "approved"
            g.approved_by = actor_id
        pms_log(self.db, self.company_id, actor_id, "pms.goals_approved", "goal", None,
                cycle_id=cycle_id, new_value={"employee_id": str(employee_id), "count": len(pending)})
        self.db.commit()
        return len(pending)

    def return_goals(self, cycle_id: UUID, employee_id: UUID, actor_id, is_admin, reason: str) -> int:
        cycle = self._cycle(cycle_id)
        self._require_goal_setting(cycle)
        if not self._can_oversee(actor_id, is_admin, employee_id):
            raise PermissionError("Only the manager or an admin can return goals")
        pending = self.db.query(Goal).filter(
            Goal.company_id == self.company_id, Goal.cycle_id == cycle_id,
            Goal.employee_id == employee_id, Goal.status == "pending_approval").all()
        if not pending:
            raise PmsConfigError("No goals pending approval")
        for g in pending:
            g.status = "draft"
        pms_log(self.db, self.company_id, actor_id, "pms.goals_returned", "goal", None,
                cycle_id=cycle_id, reason=reason,
                new_value={"employee_id": str(employee_id), "count": len(pending)})
        self.db.commit()
        return len(pending)

    # ── progress ─────────────────────────────────────────────
    def _refresh_final_achievement(self, g: Goal) -> None:
        latest = max(g.progress, key=lambda p: (p.recorded_on, p.created_at), default=None)
        g.final_achievement_pct = (
            achievement_pct(latest.actual_value, g.target_value, g.direction) if latest else None)

    def record_progress(self, goal_id: UUID, actor_id, is_admin, data: dict) -> GoalProgress:
        g = self._goal(goal_id)
        cycle = self._cycle(g.cycle_id)
        if cycle.status not in PROGRESS_STATUSES:
            raise PmsConfigError("Progress cannot be recorded in the cycle's current state")
        if g.status not in ("approved", "locked"):
            raise PmsConfigError("Progress can only be recorded on approved goals")
        if not self._can_view(actor_id, is_admin, g.employee_id):
            raise PermissionError("Not allowed to record progress for this goal")
        actual = Decimal(str(data["actual_value"]))
        p = GoalProgress(
            company_id=self.company_id, goal_id=g.id,
            recorded_on=data.get("recorded_on") or date.today(),
            actual_value=actual,
            achievement_pct=achievement_pct(actual, g.target_value, g.direction),
            note=data.get("note"), recorded_by=actor_id)
        self.db.add(p)
        self.db.flush()
        self.db.refresh(g)
        self._refresh_final_achievement(g)
        pms_log(self.db, self.company_id, actor_id, "pms.goal_progress_recorded", "goal", g.id,
                cycle_id=g.cycle_id,
                new_value={"actual_value": str(actual), "achievement_pct": str(p.achievement_pct)})
        self.db.commit()
        self.db.refresh(p)
        return p

    # ── KPI templates ────────────────────────────────────────
    def list_templates(self) -> list[KpiTemplate]:
        return (self.db.query(KpiTemplate).filter(KpiTemplate.company_id == self.company_id)
                .order_by(KpiTemplate.name).all())

    def create_template(self, actor_id, data: dict) -> KpiTemplate:
        t = KpiTemplate(
            company_id=self.company_id, name=data["name"].strip(),
            department_id=data.get("department_id"), designation_id=data.get("designation_id"),
            items=[{k: (str(v) if isinstance(v, Decimal) else v) for k, v in i.items()}
                   for i in data["items"]])
        self.db.add(t)
        self.db.flush()
        pms_log(self.db, self.company_id, actor_id, "pms.kpi_template_created",
                "kpi_template", t.id, new_value={"name": t.name, "items": len(t.items)})
        self.db.commit()
        self.db.refresh(t)
        return t

    def delete_template(self, actor_id, template_id: UUID) -> None:
        t = self.db.query(KpiTemplate).filter(
            KpiTemplate.id == template_id, KpiTemplate.company_id == self.company_id).first()
        if not t:
            raise LookupError("Template not found")
        pms_log(self.db, self.company_id, actor_id, "pms.kpi_template_deleted",
                "kpi_template", t.id, old_value={"name": t.name})
        self.db.delete(t)
        self.db.commit()

    def apply_template(self, cycle_id: UUID, template_id: UUID, employee_id: UUID | None,
                       actor_id, is_admin) -> list[Goal]:
        cycle = self._cycle(cycle_id)
        self._require_goal_setting(cycle)
        employee_id = employee_id or actor_id
        if not employee_id:
            raise PmsConfigError("employee_id is required")
        self._participant(cycle_id, employee_id)
        oversee = self._can_oversee(actor_id, is_admin, employee_id)
        if employee_id != actor_id and not oversee:
            raise PermissionError("Not allowed to assign goals to this employee")
        t = self.db.query(KpiTemplate).filter(
            KpiTemplate.id == template_id, KpiTemplate.company_id == self.company_id).first()
        if not t:
            raise LookupError("Template not found")
        if self._weight_total(cycle_id, employee_id) > 0:
            raise PmsConfigError("Employee already has goals in this cycle; remove them first")
        by_manager = oversee and employee_id != actor_id
        created = []
        for item in t.items:
            g = Goal(
                company_id=self.company_id, cycle_id=cycle_id, employee_id=employee_id,
                kpi_template_id=t.id, title=item["title"], category=item.get("category", "kpi"),
                weight=Decimal(str(item["weight"])), target_value=Decimal(str(item["target_value"])),
                unit=item.get("unit"), direction=item.get("direction", "higher_better"),
                status="approved" if by_manager else "draft",
                approved_by=actor_id if by_manager else None)
            self.db.add(g)
            created.append(g)
        self.db.flush()
        pms_log(self.db, self.company_id, actor_id, "pms.kpi_template_applied", "goal", None,
                cycle_id=cycle_id,
                new_value={"template_id": str(t.id), "employee_id": str(employee_id),
                           "count": len(created)})
        self.db.commit()
        for g in created:
            self.db.refresh(g)
        return created
