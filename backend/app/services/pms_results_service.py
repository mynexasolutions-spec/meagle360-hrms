"""Appraisal results: score adjustment, finalize, release, close, audit log.

  - Adjusting a score requires a reason and is audited.
  - Finalizing locks every participant and creates hike suggestions.
  - Employees cannot see results until the appraisal is released.
"""

from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models.pms import PmsAuditLog, ReviewCycle, ReviewParticipant
from app.services.pms_audit import pms_log
from app.services.pms_config_service import PmsConfigError, pick_slab

TWO = Decimal("0.01")
RELEASED_CYCLE_STATES = ("released", "payroll_approved", "closed")


def effective_score_of(part: ReviewParticipant) -> Decimal | None:
    return part.adjusted_score if part.adjusted_score is not None else part.final_score


class PmsResultsService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    def _cycle(self, cycle_id: UUID) -> ReviewCycle:
        c = self.db.query(ReviewCycle).filter(
            ReviewCycle.id == cycle_id, ReviewCycle.company_id == self.company_id,
            ReviewCycle.period_type == "appraisal",
        ).first()
        if not c:
            raise LookupError("Appraisal not found")
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
            raise PmsConfigError("This appraisal is already finalized")

        from app.services.pms_appraisal_service import PmsAppraisalService
        PmsAppraisalService(self.db, self.company_id).refresh_scores(cycle)

        parts = self.db.query(ReviewParticipant).filter(
            ReviewParticipant.company_id == self.company_id,
            ReviewParticipant.cycle_id == cycle.id,
        ).all()

        now = datetime.now(timezone.utc)
        for p in parts:
            if p.locked_at is None:
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
            raise PmsConfigError("Finalize the appraisal before sharing results")
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
            raise PmsConfigError("Share the results before closing the appraisal")
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

    # ── Audit log read (Admin only) ──────────────────────────
    def list_audit_logs(self, cycle_id: UUID | None = None, limit: int = 200) -> list[PmsAuditLog]:
        q = self.db.query(PmsAuditLog).filter(PmsAuditLog.company_id == self.company_id)
        if cycle_id:
            q = q.filter(PmsAuditLog.cycle_id == cycle_id)
        return q.order_by(PmsAuditLog.created_at.desc()).limit(limit).all()
