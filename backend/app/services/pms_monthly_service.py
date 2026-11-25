"""PMS monthly reviews.

Each calendar month is one auto-created ReviewCycle (period_type='monthly').
There are no stages to advance: what is allowed follows from the date and
from whether the manager has reviewed the employee yet.

  * goals / progress / note: open until the manager reviews that employee
  * future months (to the end of next year): goals only
  * review: opens on the last N days (company setting), stays open (and
    editable) until a finalized appraisal covers the month
  * score = goals blended with the manager's 1-5 rating; just the rating
    when there are no goals. An unreviewed month has no score at all, so it
    is left out of averages instead of counting as zero.
"""

import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.employee import Employee
from app.models.pms import Goal, GoalProgress, ReviewCycle, ReviewParticipant
from app.services.pms_audit import pms_log
from app.services.pms_config_service import (
    EXCLUDED_EMPLOYMENT_TYPES, PmsConfigError, PmsConfigService, pick_slab,
)
from app.services.pms_goal_service import achievement_pct as raw_achievement_pct
from app.services.pms_goal_service import compute_goals_score
from app.services.pms_scoring import compute_final_score, mean, q2

IST = timezone(timedelta(hours=5, minutes=30))
MAX_GOALS = 5
EQUAL_WEIGHT = Decimal("20")  # monthly goals all count the same
FINAL_STATES = ("finalized", "released", "payroll_approved", "closed")


# ── Pure helpers ─────────────────────────────────────────────

def today_ist() -> date:
    return datetime.now(IST).date()


def parse_month(value: str) -> date:
    try:
        d = datetime.strptime(value, "%Y-%m").date()
    except ValueError:
        raise PmsConfigError("Month must look like 2026-11")
    if not 2000 <= d.year <= 2100:
        raise PmsConfigError("Month is out of range")
    return d


def month_end(first: date) -> date:
    return first.replace(day=calendar.monthrange(first.year, first.month)[1])


def add_months(first: date, n: int) -> date:
    y, m = divmod(first.year * 12 + first.month - 1 + n, 12)
    return date(y, m + 1, 1)


def month_key(d: date) -> str:
    return d.strftime("%Y-%m")


def last_open_month(today: date) -> date:
    """Goals can be planned up to December of next year."""
    return date(today.year + 1, 12, 1)


def review_opens_on(first: date, days: int) -> date:
    """First of the last `days` days; never before the month starts."""
    return max(first, month_end(first) - timedelta(days=days - 1))


def review_due_on(first: date, day: int) -> date:
    return add_months(first, 1).replace(day=day)


def achievement_pct(actual, target, direction) -> Decimal:
    """Clamped so a wild value still fits the Numeric(6, 2) column."""
    return min(raw_achievement_pct(actual, target, direction), Decimal("999"))


def monthly_score(goals_score, manager_score, weight_goals, weight_rating) -> Decimal | None:
    """None until the manager has rated, whatever the goals look like."""
    if manager_score is None:
        return None
    rating = Decimal(manager_score)
    score = compute_final_score(
        {"goals": goals_score, "rating": rating},
        {"goals": weight_goals, "rating": weight_rating})
    return score if score is not None else q2(rating)


def _latest(g: Goal) -> GoalProgress | None:
    return max(g.progress, key=lambda x: (x.recorded_on, x.created_at), default=None)


class PmsMonthlyService:
    def __init__(self, db: Session, company_id: UUID, today: date | None = None):
        self.db = db
        self.company_id = company_id
        self.today = today or today_ist()

    # ── month creation / enrolment ───────────────────────────
    def _find(self, first: date) -> ReviewCycle | None:
        return self.db.query(ReviewCycle).filter(
            ReviewCycle.company_id == self.company_id,
            ReviewCycle.period_type == "monthly",
            ReviewCycle.start_date == first).first()

    def first_month(self) -> date | None:
        row = self.db.query(ReviewCycle.start_date).filter(
            ReviewCycle.company_id == self.company_id,
            ReviewCycle.period_type == "monthly").order_by(ReviewCycle.start_date).first()
        return row[0] if row else None

    def _enrol(self, cycle: ReviewCycle) -> None:
        """Add new joiners and follow manager changes for pending reviews."""
        have = {p.employee_id: p for p in self.db.query(ReviewParticipant).filter(
            ReviewParticipant.cycle_id == cycle.id).all()}
        for e in self.db.query(Employee).filter(
                Employee.company_id == self.company_id,
                Employee.employment_status == "active",
                Employee.employment_type.notin_(EXCLUDED_EMPLOYMENT_TYPES),
                Employee.date_of_hire <= cycle.end_date).all():
            p = have.get(e.id)
            if p is None:
                self.db.add(ReviewParticipant(
                    company_id=self.company_id, cycle_id=cycle.id, employee_id=e.id,
                    manager_id=e.manager_id, department_id=e.department_id,
                    designation_id=e.designation_id, status="pending"))
            elif p.manager_score is None and p.manager_id != e.manager_id:
                p.manager_id = e.manager_id

    def _create(self, first: date) -> ReviewCycle:
        # launched_at stays empty until the month begins; see _launch.
        c = ReviewCycle(
            company_id=self.company_id, period_type="monthly", status="goal_setting",
            name=first.strftime("%B %Y"), start_date=first, end_date=month_end(first),
            config_snapshot=PmsConfigService(self.db, self.company_id).build_snapshot())
        self.db.add(c)
        self.db.flush()
        return c

    def _launch(self, cycle: ReviewCycle) -> None:
        """The month has begun: take the settings as they are now, not as
        they were when someone planned ahead."""
        cycle.config_snapshot = PmsConfigService(self.db, self.company_id).build_snapshot()
        cycle.launched_at = datetime.now(timezone.utc)

    def ensure(self, first: date | None = None) -> None:
        """Create the current month (and any month skipped since the first
        one), plus the future month being viewed, and sync enrolment. Safe
        to call on every visit."""
        current = self.today.replace(day=1)
        # The unique indexes make a concurrent creator lose cleanly; retry
        # once so the loser simply picks up the winner's rows.
        for attempt in range(2):
            try:
                m = min(self.first_month() or current, current)
                while m <= current:
                    c = self._find(m) or self._create(m)
                    starting = c.launched_at is None
                    if starting:
                        self._launch(c)
                    if starting or m == current:
                        self._enrol(c)
                    m = add_months(m, 1)
                if first and current < first <= last_open_month(self.today):
                    self._enrol(self._find(first) or self._create(first))
                self.db.commit()
                return
            except IntegrityError:
                self.db.rollback()
                if attempt:
                    raise

    def cycle_for(self, first: date) -> ReviewCycle:
        c = self._find(first)
        if not c:
            raise LookupError("No reviews exist for this month")
        return c

    def _window(self, first: date) -> tuple[date, date]:
        """(opens, due). Read live, so a change applies to open months too."""
        cfg = PmsConfigService(self.db, self.company_id).get_config()
        return (review_opens_on(first, cfg.review_opens_days),
                review_due_on(first, cfg.review_due_day))

    # ── guards ───────────────────────────────────────────────
    def _participant(self, cycle: ReviewCycle, employee_id) -> ReviewParticipant:
        p = self.db.query(ReviewParticipant).options(
            joinedload(ReviewParticipant.employee)).filter(
            ReviewParticipant.company_id == self.company_id,
            ReviewParticipant.cycle_id == cycle.id,
            ReviewParticipant.employee_id == employee_id).first() if employee_id else None
        if not p:
            raise LookupError("Employee is not part of this month")
        return p

    @staticmethod
    def _can_review(p: ReviewParticipant, actor_id, is_admin) -> bool:
        """Nobody reviews themselves, not even an admin."""
        if actor_id is not None and p.employee_id == actor_id:
            return False
        return bool(is_admin or (actor_id and p.manager_id == actor_id))

    def _locked(self, cycle: ReviewCycle) -> bool:
        return self.db.query(ReviewCycle.id).filter(
            ReviewCycle.company_id == self.company_id,
            ReviewCycle.period_type == "appraisal",
            ReviewCycle.status.in_(FINAL_STATES),
            ReviewCycle.start_date <= cycle.start_date,
            ReviewCycle.end_date >= cycle.end_date).first() is not None

    def _require_open(self, cycle: ReviewCycle, p: ReviewParticipant) -> None:
        if p.manager_score is not None:
            raise PmsConfigError("This month has already been reviewed")
        if self._locked(cycle):
            raise PmsConfigError("This month is part of a finalized appraisal and is locked")

    def _require_started(self, cycle: ReviewCycle) -> None:
        if cycle.start_date > self.today:
            raise PmsConfigError(f"This month starts on {cycle.start_date:%d %b %Y}")

    def _access(self, cycle, employee_id, actor_id, is_admin) -> tuple[ReviewParticipant, bool]:
        """Participant + whether the actor is their reviewer (else it's them)."""
        p = self._participant(cycle, employee_id)
        reviewer = self._can_review(p, actor_id, is_admin)
        if not reviewer and actor_id != p.employee_id:
            raise PermissionError("Not allowed for this employee")
        return p, reviewer

    # ── goals ────────────────────────────────────────────────
    def _goals(self, cycle_id, employee_ids) -> dict:
        out: dict = {}
        if employee_ids:
            for g in (self.db.query(Goal).options(joinedload(Goal.progress)).filter(
                    Goal.company_id == self.company_id, Goal.cycle_id == cycle_id,
                    Goal.employee_id.in_(employee_ids)).order_by(Goal.created_at).all()):
                out.setdefault(g.employee_id, []).append(g)
        return out

    def _goal_ctx(self, goal_id, actor_id, is_admin) -> tuple[Goal, bool]:
        g = self.db.query(Goal).join(ReviewCycle, ReviewCycle.id == Goal.cycle_id).filter(
            Goal.id == goal_id, Goal.company_id == self.company_id,
            ReviewCycle.period_type == "monthly").first()
        if not g:
            raise LookupError("Goal not found")
        cycle = self.db.get(ReviewCycle, g.cycle_id)
        p, reviewer = self._access(cycle, g.employee_id, actor_id, is_admin)
        self._require_open(cycle, p)
        return g, reviewer

    @staticmethod
    def _check_owner(g: Goal, reviewer: bool) -> None:
        if g.approved_by is not None and not reviewer:
            raise PermissionError("This goal was set by your manager, only they can change it")

    def add_goal(self, first: date, actor_id, is_admin, data: dict) -> Goal:
        cycle = self.cycle_for(first)
        employee_id = data.pop("employee_id", None) or actor_id
        p, reviewer = self._access(cycle, employee_id, actor_id, is_admin)
        self._require_open(cycle, p)
        if len(self._goals(cycle.id, [employee_id]).get(employee_id, [])) >= MAX_GOALS:
            raise PmsConfigError(f"At most {MAX_GOALS} goals per month")
        g = Goal(company_id=self.company_id, cycle_id=cycle.id, employee_id=employee_id,
                 weight=EQUAL_WEIGHT, status="approved",
                 approved_by=actor_id if reviewer else None, **data)
        self.db.add(g)
        self.db.flush()
        pms_log(self.db, self.company_id, actor_id, "pms.goal_created", "goal", g.id,
                cycle_id=cycle.id, new_value={"title": g.title, "target": str(g.target_value)})
        self.db.commit()
        return g

    def update_goal(self, goal_id, actor_id, is_admin, data: dict) -> Goal:
        g, reviewer = self._goal_ctx(goal_id, actor_id, is_admin)
        self._check_owner(g, reviewer)
        old = {"title": g.title, "target": str(g.target_value)}
        for k, v in data.items():
            setattr(g, k, v)
        for pr in g.progress:
            pr.achievement_pct = achievement_pct(pr.actual_value, g.target_value, g.direction)
        self._refresh(g)
        pms_log(self.db, self.company_id, actor_id, "pms.goal_updated", "goal", g.id,
                cycle_id=g.cycle_id, old_value=old,
                new_value={"title": g.title, "target": str(g.target_value)})
        self.db.commit()
        return g

    def delete_goal(self, goal_id, actor_id, is_admin) -> None:
        g, reviewer = self._goal_ctx(goal_id, actor_id, is_admin)
        self._check_owner(g, reviewer)
        pms_log(self.db, self.company_id, actor_id, "pms.goal_deleted", "goal", g.id,
                cycle_id=g.cycle_id, old_value={"title": g.title})
        self.db.delete(g)
        self.db.commit()

    @staticmethod
    def _refresh(g: Goal) -> None:
        last = _latest(g)
        g.final_achievement_pct = last.achievement_pct if last else None

    def record_progress(self, goal_id, actor_id, is_admin, actual: Decimal, note) -> None:
        g, _ = self._goal_ctx(goal_id, actor_id, is_admin)
        self._require_started(self.db.get(ReviewCycle, g.cycle_id))
        self.db.add(GoalProgress(
            company_id=self.company_id, goal_id=g.id, recorded_on=self.today,
            actual_value=actual, note=note, recorded_by=actor_id,
            achievement_pct=achievement_pct(actual, g.target_value, g.direction)))
        self.db.flush()
        self.db.refresh(g)
        self._refresh(g)
        pms_log(self.db, self.company_id, actor_id, "pms.goal_progress_recorded", "goal", g.id,
                cycle_id=g.cycle_id, new_value={"actual_value": str(actual)})
        self.db.commit()

    def copy_previous_goals(self, first: date, actor_id) -> int:
        """Bring my most recent earlier month's goals into this month."""
        cycle = self.cycle_for(first)
        p = self._participant(cycle, actor_id)
        self._require_open(cycle, p)
        prev = (self.db.query(ReviewCycle).join(Goal, Goal.cycle_id == ReviewCycle.id).filter(
            ReviewCycle.company_id == self.company_id, ReviewCycle.period_type == "monthly",
            ReviewCycle.start_date < first, Goal.employee_id == actor_id)
            .order_by(ReviewCycle.start_date.desc()).first())
        if not prev:
            raise PmsConfigError("No earlier goals to copy")
        mine = self._goals(cycle.id, [actor_id]).get(actor_id, [])
        titles = {g.title.lower() for g in mine}
        room = max(MAX_GOALS - len(mine), 0)
        src = [g for g in self._goals(prev.id, [actor_id])[actor_id]
               if g.title.lower() not in titles][:room]
        for g in src:
            self.db.add(Goal(
                company_id=self.company_id, cycle_id=cycle.id, employee_id=actor_id,
                title=g.title, description=g.description, category=g.category,
                weight=EQUAL_WEIGHT, target_value=g.target_value, unit=g.unit,
                direction=g.direction, status="approved", approved_by=g.approved_by))
        self.db.commit()
        return len(src)

    # ── employee note ────────────────────────────────────────
    def save_note(self, first: date, actor_id, note: str) -> None:
        cycle = self.cycle_for(first)
        p = self._participant(cycle, actor_id)
        self._require_started(cycle)
        self._require_open(cycle, p)
        p.self_note = note.strip() or None
        p.status = "in_progress" if p.self_note else "pending"
        self.db.commit()

    # ── manager review ───────────────────────────────────────
    def review(self, first: date, employee_id, actor_id, is_admin,
               score: int, comment: str) -> None:
        cycle = self.cycle_for(first)
        p = self._participant(cycle, employee_id)
        if not self._can_review(p, actor_id, is_admin):
            raise PermissionError("Only the employee's manager or an admin can review them")
        opens, _ = self._window(first)
        if self.today < opens:
            raise PmsConfigError(f"Reviews open on {opens:%d %b %Y}")
        if self._locked(cycle):
            raise PmsConfigError("This month is part of a finalized appraisal and is locked")

        cfg = cycle.config_snapshot["config"]
        goals = self._goals(cycle.id, [p.employee_id]).get(p.employee_id, [])
        old = ({"score": p.manager_score, "final": str(p.final_score)}
               if p.manager_score is not None else None)
        p.goals_score = compute_goals_score(
            [(g.weight, g.final_achievement_pct) for g in goals],
            cap=Decimal(str(cfg["goal_achievement_cap"])))
        p.manager_score = score
        p.manager_comment = comment.strip() or None
        p.final_score = monthly_score(
            p.goals_score, score, cfg["weight_goals"], cfg["weight_competency"])
        slab = pick_slab(cycle.config_snapshot["slabs"], p.final_score)
        p.final_rating_label = slab["label"] if slab else None
        p.status = "submitted"
        p.released_at = datetime.now(timezone.utc)
        pms_log(self.db, self.company_id, actor_id, "pms.month_reviewed", "review_participant",
                p.id, cycle_id=cycle.id, old_value=old,
                new_value={"score": score, "final": str(p.final_score)})
        self.db.commit()

    # ── views ────────────────────────────────────────────────
    @staticmethod
    def _goal_out(g: Goal) -> dict:
        last = _latest(g)
        return {"id": g.id, "title": g.title, "target_value": g.target_value, "unit": g.unit,
                "direction": g.direction, "achievement_pct": g.final_achievement_pct,
                "actual_value": last.actual_value if last else None,
                "note": last.note if last else None, "set_by_manager": g.approved_by is not None}

    def _part_out(self, p: ReviewParticipant, goals: list[Goal], locked: bool) -> dict:
        return {"employee_id": p.employee_id,
                "employee_name": p.employee.full_name if p.employee else "",
                "goals": [self._goal_out(g) for g in goals],
                "self_note": p.self_note, "reviewed": p.manager_score is not None,
                "manager_score": p.manager_score, "manager_comment": p.manager_comment,
                "goals_score": p.goals_score, "score": p.final_score,
                "label": p.final_rating_label, "locked": locked}

    def _period(self, first: date) -> dict:
        opens, due = self._window(first)
        return {"month": month_key(first), "current_month": month_key(self.today),
                "last_month": month_key(last_open_month(self.today)),
                "upcoming": first > self.today, "starts_on": first,
                "review_opens_on": opens, "review_due_on": due,
                "review_open": self.today >= opens, "overdue": self.today > due,
                "days_left": max((month_end(first) - self.today).days, 0)}

    def scores(self, employee_id, start: date, end: date) -> list[tuple[ReviewParticipant, ReviewCycle]]:
        return (self.db.query(ReviewParticipant, ReviewCycle)
                .join(ReviewCycle, ReviewCycle.id == ReviewParticipant.cycle_id)
                .filter(ReviewParticipant.company_id == self.company_id,
                        ReviewParticipant.employee_id == employee_id,
                        ReviewParticipant.final_score.isnot(None),
                        ReviewCycle.period_type == "monthly",
                        ReviewCycle.start_date >= start, ReviewCycle.start_date <= end)
                .order_by(ReviewCycle.start_date).all())

    def my_month(self, first: date, actor_id, is_admin) -> dict:
        self.ensure(first)
        cycle = self._find(first)
        me, has_team, can_copy = None, False, False
        if cycle and actor_id:
            p = self.db.query(ReviewParticipant).options(
                joinedload(ReviewParticipant.employee)).filter(
                ReviewParticipant.cycle_id == cycle.id,
                ReviewParticipant.employee_id == actor_id).first()
            if p:
                me = self._part_out(p, self._goals(cycle.id, [actor_id]).get(actor_id, []),
                                    self._locked(cycle))
        rows = []
        if actor_id:
            rows = self.scores(actor_id, date(first.year, 1, 1), date(first.year, 12, 1))
            has_team = self.db.query(ReviewParticipant.id).join(
                ReviewCycle, ReviewCycle.id == ReviewParticipant.cycle_id).filter(
                ReviewParticipant.company_id == self.company_id,
                ReviewParticipant.manager_id == actor_id,
                ReviewCycle.period_type == "monthly").first() is not None
            can_copy = self.db.query(Goal.id).join(
                ReviewCycle, ReviewCycle.id == Goal.cycle_id).filter(
                Goal.company_id == self.company_id, Goal.employee_id == actor_id,
                ReviewCycle.period_type == "monthly",
                ReviewCycle.start_date < first).first() is not None
        avg = mean([p.final_score for p, _ in rows])
        start = self.first_month()
        return {**self._period(first), "first_month": month_key(start) if start else None,
                "is_admin": is_admin, "has_team": has_team,
                "can_copy_goals": can_copy, "me": me,
                "average": q2(avg) if avg is not None else None,
                "history": [{"month": month_key(c.start_date), "score": p.final_score}
                            for p, c in rows]}

    def team(self, first: date, actor_id, is_admin, everyone: bool) -> dict:
        if everyone and not is_admin:
            raise PermissionError("Admin only")
        cycle = self._find(first)
        people = []
        if cycle and (everyone or actor_id):
            q = (self.db.query(ReviewParticipant).options(joinedload(ReviewParticipant.employee))
                 .filter(ReviewParticipant.company_id == self.company_id,
                         ReviewParticipant.cycle_id == cycle.id))
            if not everyone:
                q = q.filter(ReviewParticipant.manager_id == actor_id)
            # People who left without a review are not anyone's to-do.
            parts = [p for p in q.all() if p.employee and (
                p.manager_score is not None or p.employee.employment_status == "active")]
            goals = self._goals(cycle.id, [p.employee_id for p in parts])
            mgr_ids = {p.manager_id for p in parts if p.manager_id}
            names = {e.id: e.full_name for e in self.db.query(Employee).filter(
                Employee.id.in_(mgr_ids)).all()} if mgr_ids else {}
            locked = self._locked(cycle)
            for p in sorted(parts, key=lambda x: x.employee.full_name.lower()):
                people.append({**self._part_out(p, goals.get(p.employee_id, []), locked),
                               "manager_name": names.get(p.manager_id),
                               "can_review": self._can_review(p, actor_id, is_admin)})
        return {**self._period(first), "people": people}
