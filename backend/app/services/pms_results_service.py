"""PMS results, attendance snapshot, review-window adjustment, finalize/release,
and rating history service.

Key safeguards:
  - Sick / medical leave is never penalized in attendance %.
  - Review-window score adjustment requires a non-empty reason and is audited.
  - Finalizing a cycle locks every participant (`locked_at`) so ratings and
    scores become immutable, and generates payroll hike suggestions.
  - Employees cannot see results until the cycle is released (`released_at`).
  - Rater identities are never exposed in any result or history payload.
"""

from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models.attendance_record import AttendanceRecord
from app.models.employee import Employee
from app.models.employee_shift import EmployeeShift
from app.models.holiday_calendar import HolidayCalendar
from app.models.leave_request import LeaveRequest
from app.models.pms import PmsAuditLog, ReviewCycle, ReviewParticipant
from app.services.pms_audit import pms_log
from app.services.pms_config_service import PmsConfigError, pick_slab
from app.services.pms_rating_service import PmsRatingService

TWO = Decimal("0.01")
RELEASED_CYCLE_STATES = ("released", "payroll_approved", "closed")
TEAM_VISIBLE_STATES = ("review", "finalized", "released", "payroll_approved", "closed")


def is_sick_leave_name(name: str | None) -> bool:
    if not name:
        return False
    low = name.lower()
    return "sick" in low or "medical" in low


def summarize_attendance(
    start_date: date,
    end_date: date,
    hire_date: date | None,
    holiday_dates: set[date],
    present_dates: set[date],
    late_count: int,
    leave_ranges: list[tuple[date, date, bool]],
) -> dict:
    """Pure attendance summary over [max(start_date, hire_date), end_date].

    leave_ranges: list of (leave_start, leave_end, is_sick).
    Sick leave days are excluded from the denominator so sick leave is
    never penalized in attendance_pct."""
    eff_start = max(start_date, hire_date) if hire_date else start_date
    if eff_start > end_date:
        return {
            "working_days": 0,
            "present_days": 0,
            "sick_leave_days": 0,
            "other_leave_days": 0,
            "late_count": 0,
            "attendance_pct": "100.00",
        }

    working_days: set[date] = set()
    cur = eff_start
    while cur <= end_date:
        if cur.weekday() < 5 and cur not in holiday_dates:
            working_days.add(cur)
        cur += timedelta(days=1)

    sick_days: set[date] = set()
    other_leave_days: set[date] = set()
    for l_start, l_end, is_sick in leave_ranges:
        d = max(l_start, eff_start)
        stop = min(l_end, end_date)
        while d <= stop:
            if d in working_days:
                if is_sick:
                    sick_days.add(d)
                else:
                    other_leave_days.add(d)
            d += timedelta(days=1)

    other_leave_days -= sick_days
    present_working = (present_dates & working_days) - sick_days
    assessable_days = len(working_days) - len(sick_days)
    if assessable_days <= 0:
        pct = Decimal("100.00")
    else:
        pct = (Decimal(len(present_working)) / Decimal(assessable_days) * 100).quantize(
            TWO, rounding=ROUND_HALF_UP
        )
        if pct > Decimal("100.00"):
            pct = Decimal("100.00")

    return {
        "working_days": len(working_days),
        "present_days": len(present_working),
        "sick_leave_days": len(sick_days),
        "other_leave_days": len(other_leave_days),
        "late_count": int(late_count),
        "attendance_pct": str(pct),
    }


def effective_score_of(part: ReviewParticipant) -> Decimal | None:
    return part.adjusted_score if part.adjusted_score is not None else part.final_score


class PmsResultsService:
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

    def _participant(self, cycle_id: UUID, employee_id: UUID) -> ReviewParticipant:
        p = (
            self.db.query(ReviewParticipant)
            .options(joinedload(ReviewParticipant.employee))
            .filter(
                ReviewParticipant.company_id == self.company_id,
                ReviewParticipant.cycle_id == cycle_id,
                ReviewParticipant.employee_id == employee_id,
            )
            .first()
        )
        if not p:
            raise LookupError("Participant not found in this cycle")
        return p

    # ── Attendance snapshot ──────────────────────────────────
    def build_attendance_snapshot(self, cycle: ReviewCycle, employee_id: UUID) -> dict:
        emp = self.db.query(Employee).filter(
            Employee.id == employee_id, Employee.company_id == self.company_id
        ).first()
        holidays = {
            h.holiday_date
            for h in self.db.query(HolidayCalendar).filter(
                HolidayCalendar.company_id == self.company_id,
                HolidayCalendar.holiday_date >= cycle.start_date,
                HolidayCalendar.holiday_date <= cycle.end_date,
            ).all()
        }
        records = self.db.query(AttendanceRecord).filter(
            AttendanceRecord.company_id == self.company_id,
            AttendanceRecord.employee_id == employee_id,
        ).all()
        present_dates: set[date] = set()
        # Optional shift lookup for late count
        emp_shift = (
            self.db.query(EmployeeShift)
            .options(joinedload(EmployeeShift.shift))
            .filter(
                EmployeeShift.company_id == self.company_id,
                EmployeeShift.employee_id == employee_id,
            )
            .order_by(EmployeeShift.effective_from.desc())
            .first()
        )
        shift_start = emp_shift.shift.start_time if (emp_shift and emp_shift.shift) else None
        late_dates: set[date] = set()
        for r in records:
            d = r.clock_in.date()
            if cycle.start_date <= d <= cycle.end_date:
                present_dates.add(d)
                if shift_start and r.clock_in.timetz().replace(tzinfo=None) > shift_start:
                    late_dates.add(d)

        leaves = (
            self.db.query(LeaveRequest)
            .options(joinedload(LeaveRequest.leave_type))
            .filter(
                LeaveRequest.company_id == self.company_id,
                LeaveRequest.employee_id == employee_id,
                LeaveRequest.status == "approved",
                LeaveRequest.end_date >= cycle.start_date,
                LeaveRequest.start_date <= cycle.end_date,
            )
            .all()
        )
        leave_ranges = [
            (lv.start_date, lv.end_date, is_sick_leave_name(lv.leave_type.name if lv.leave_type else None))
            for lv in leaves
        ]
        return summarize_attendance(
            cycle.start_date,
            cycle.end_date,
            emp.date_of_hire if emp else None,
            holidays,
            present_dates,
            len(late_dates),
            leave_ranges,
        )

    # ── Review-window adjustment ─────────────────────────────
    def adjust_score(
        self,
        cycle_id: UUID,
        employee_id: UUID,
        adjusted_score: Decimal,
        reason: str,
        actor_id: UUID | None,
        is_admin: bool,
    ) -> ReviewParticipant:
        cycle = self._cycle(cycle_id)
        if cycle.status != "review":
            raise PmsConfigError("Scores can only be adjusted during the review window")
        part = self._participant(cycle_id, employee_id)
        if part.locked_at is not None:
            raise PmsConfigError("Participant result is locked and cannot be modified")
        if not (is_admin or (actor_id and part.manager_id == actor_id)):
            raise PermissionError("Only the employee's manager or an admin can adjust scores")
        clean_reason = (reason or "").strip()
        if not clean_reason:
            raise PmsConfigError("A reason is required when adjusting a score")

        scale_max = Decimal(str(cycle.config_snapshot["config"].get("rating_scale_max", 5)))
        score_dec = Decimal(str(adjusted_score)).quantize(TWO, rounding=ROUND_HALF_UP)
        if score_dec < 0 or score_dec > scale_max:
            raise PmsConfigError(f"Adjusted score must be between 0 and {scale_max}")

        old_adj = str(part.adjusted_score) if part.adjusted_score is not None else None
        old_label = part.final_rating_label
        slab = pick_slab(cycle.config_snapshot["slabs"], score_dec)
        part.adjusted_score = score_dec
        part.adjustment_reason = clean_reason
        part.final_rating_label = slab["label"] if slab else None

        pms_log(
            self.db,
            self.company_id,
            actor_id,
            "pms.score_adjusted",
            "review_participant",
            part.id,
            cycle_id=cycle.id,
            old_value={"adjusted_score": old_adj, "final_score": str(part.final_score), "label": old_label},
            new_value={"adjusted_score": str(score_dec), "label": part.final_rating_label},
            reason=clean_reason,
        )
        self.db.commit()
        self.db.refresh(part)
        return part

    # ── Lifecycle: finalize / release / close ────────────────
    def finalize_cycle(self, actor_id: UUID | None, cycle_id: UUID) -> ReviewCycle:
        cycle = self._cycle(cycle_id)
        if cycle.status != "review":
            raise PmsConfigError("Only a cycle in 'review' stage can be finalized")

        rating_svc = PmsRatingService(self.db, self.company_id)
        parts = self.db.query(ReviewParticipant).filter(
            ReviewParticipant.company_id == self.company_id,
            ReviewParticipant.cycle_id == cycle.id,
        ).all()

        now = datetime.now(timezone.utc)
        for p in parts:
            if p.locked_at is None:
                prev_adj = p.adjusted_score
                prev_reason = p.adjustment_reason
                rating_svc.compute_participant(cycle, p)
                if prev_adj is not None:
                    p.adjusted_score = prev_adj
                    p.adjustment_reason = prev_reason
                    slab = pick_slab(cycle.config_snapshot["slabs"], prev_adj)
                    p.final_rating_label = slab["label"] if slab else None
                if p.attendance_snapshot is None:
                    p.attendance_snapshot = self.build_attendance_snapshot(cycle, p.employee_id)
                p.locked_at = now
                p.status = "finalized"

        cycle.status = "finalized"
        cycle.finalized_at = now
        cycle.finalized_by = actor_id
        self.db.flush()

        # Generate payroll hike suggestions (never auto-applied)
        from app.services.pms_payroll_service import PmsPayrollService
        revisions_created = PmsPayrollService(self.db, self.company_id).generate_for_cycle(
            cycle, actor_id=actor_id, commit=False
        )

        pms_log(
            self.db,
            self.company_id,
            actor_id,
            "pms.cycle_finalized",
            "review_cycle",
            cycle.id,
            cycle_id=cycle.id,
            new_value={"participants_locked": len(parts), "revisions_suggested": revisions_created},
        )
        self.db.commit()
        self.db.refresh(cycle)
        return cycle

    def release_cycle(self, actor_id: UUID | None, cycle_id: UUID) -> ReviewCycle:
        cycle = self._cycle(cycle_id)
        if cycle.status != "finalized":
            raise PmsConfigError("Cycle must be finalized before releasing results to employees")
        now = datetime.now(timezone.utc)
        parts = self.db.query(ReviewParticipant).filter(
            ReviewParticipant.company_id == self.company_id,
            ReviewParticipant.cycle_id == cycle.id,
        ).all()
        for p in parts:
            p.released_at = now
        cycle.status = "released"
        pms_log(
            self.db,
            self.company_id,
            actor_id,
            "pms.cycle_released",
            "review_cycle",
            cycle.id,
            cycle_id=cycle.id,
            new_value={"released_participants": len(parts)},
        )
        self.db.commit()
        self.db.refresh(cycle)
        return cycle

    def close_cycle(self, actor_id: UUID | None, cycle_id: UUID) -> ReviewCycle:
        cycle = self._cycle(cycle_id)
        if cycle.status not in ("released", "payroll_approved"):
            raise PmsConfigError("Cycle can only be closed after results are released")
        old = cycle.status
        cycle.status = "closed"
        pms_log(
            self.db,
            self.company_id,
            actor_id,
            "pms.cycle_closed",
            "review_cycle",
            cycle.id,
            cycle_id=cycle.id,
            old_value={"status": old},
            new_value={"status": "closed"},
        )
        self.db.commit()
        self.db.refresh(cycle)
        return cycle

    # ── Results & distribution views ─────────────────────────
    def my_result(self, cycle_id: UUID, actor_id: UUID | None) -> ReviewParticipant:
        if not actor_id:
            raise LookupError("No employee record linked to this account")
        cycle = self._cycle(cycle_id)
        part = self._participant(cycle_id, actor_id)
        if cycle.status not in RELEASED_CYCLE_STATES and part.released_at is None:
            raise PermissionError("Results for this cycle have not been released yet")
        return part

    def team_results(self, cycle_id: UUID, manager_id: UUID | None, is_admin: bool) -> list[ReviewParticipant]:
        cycle = self._cycle(cycle_id)
        if cycle.status not in TEAM_VISIBLE_STATES:
            raise PmsConfigError("Team results are available from the review stage onwards")
        q = (
            self.db.query(ReviewParticipant)
            .options(joinedload(ReviewParticipant.employee))
            .filter(
                ReviewParticipant.company_id == self.company_id,
                ReviewParticipant.cycle_id == cycle_id,
            )
        )
        if not is_admin:
            if not manager_id:
                raise PermissionError("Manager access required")
            q = q.filter(ReviewParticipant.manager_id == manager_id)
        return q.all()

    def company_results(self, cycle_id: UUID) -> dict:
        cycle = self._cycle(cycle_id)
        parts = (
            self.db.query(ReviewParticipant)
            .options(joinedload(ReviewParticipant.employee))
            .filter(
                ReviewParticipant.company_id == self.company_id,
                ReviewParticipant.cycle_id == cycle_id,
            )
            .all()
        )
        distribution: dict[str, int] = {}
        scores: list[Decimal] = []
        for p in parts:
            eff = effective_score_of(p)
            if eff is not None:
                scores.append(eff)
            label = p.final_rating_label or "Unrated"
            distribution[label] = distribution.get(label, 0) + 1
        avg_score = (
            (sum(scores) / len(scores)).quantize(TWO, rounding=ROUND_HALF_UP)
            if scores
            else None
        )
        return {
            "cycle_id": cycle.id,
            "cycle_name": cycle.name,
            "status": cycle.status,
            "participant_count": len(parts),
            "average_score": avg_score,
            "distribution": distribution,
            "participants": parts,
        }

    # ── Rating history across cycles ─────────────────────────
    def history(
        self, target_employee_id: UUID, actor_id: UUID | None, is_admin: bool
    ) -> list[tuple[ReviewParticipant, ReviewCycle]]:
        if not is_admin and actor_id != target_employee_id:
            emp = self.db.query(Employee).filter(
                Employee.id == target_employee_id, Employee.company_id == self.company_id
            ).first()
            if not emp or emp.manager_id != actor_id:
                raise PermissionError("Not allowed to view this employee's rating history")

        q = (
            self.db.query(ReviewParticipant, ReviewCycle)
            .join(ReviewCycle, ReviewCycle.id == ReviewParticipant.cycle_id)
            .filter(
                ReviewParticipant.company_id == self.company_id,
                ReviewParticipant.employee_id == target_employee_id,
            )
        )
        if not is_admin and actor_id == target_employee_id:
            q = q.filter(ReviewCycle.status.in_(RELEASED_CYCLE_STATES))
        else:
            q = q.filter(ReviewCycle.status.in_(("finalized", *RELEASED_CYCLE_STATES)))
        return q.order_by(ReviewCycle.end_date.desc()).all()

    # ── Audit log read (Admin only) ──────────────────────────
    def list_audit_logs(self, cycle_id: UUID | None = None, limit: int = 200) -> list[PmsAuditLog]:
        q = self.db.query(PmsAuditLog).filter(PmsAuditLog.company_id == self.company_id)
        if cycle_id:
            q = q.filter(PmsAuditLog.cycle_id == cycle_id)
        return q.order_by(PmsAuditLog.created_at.desc()).limit(limit).all()
