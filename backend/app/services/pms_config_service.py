"""PMS configuration service: per-tenant config, competency parameters, slabs.

Pure validation helpers (validate_weights / find_slab_overlap /
pick_slab) are module-level so they can be unit tested without a DB.
"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.pms import CompetencyParameter, PmsConfig, RatingSlab
from app.services.pms_audit import pms_log

DEFAULT_PARAMETERS = [
    ("Teamwork", "Collaborates and supports colleagues"),
    ("Communication", "Clear, timely and respectful communication"),
    ("Ownership", "Takes responsibility for outcomes"),
    ("Initiative", "Proactively improves things without being asked"),
    ("Learning", "Builds new skills and adapts"),
]

# (label, min, max, hike%) — max is exclusive except for the top slab (5.00).
DEFAULT_SLABS = [
    ("Needs Improvement", Decimal("0.00"), Decimal("2.50"), Decimal("0")),
    ("Meets Expectations", Decimal("2.50"), Decimal("3.50"), Decimal("4")),
    ("Exceeds Expectations", Decimal("3.50"), Decimal("4.50"), Decimal("8")),
    ("Outstanding", Decimal("4.50"), Decimal("5.00"), Decimal("12")),
]

MAX_ACTIVE_PARAMETERS = 10


class PmsConfigError(ValueError):
    """Business-rule violation; routers translate this to HTTP 400."""


def validate_weights(cfg: dict) -> None:
    pillars = sum(Decimal(str(cfg[k])) for k in (
        "weight_goals", "weight_competency", "weight_discipline", "weight_growth"))
    if pillars != 100:
        raise PmsConfigError(f"Pillar weights must sum to 100 (got {pillars})")
    raters = sum(Decimal(str(cfg[k])) for k in ("weight_manager", "weight_peer", "weight_self"))
    if raters != 100:
        raise PmsConfigError(f"Rater weights (manager/peer/self) must sum to 100 (got {raters})")
    if Decimal(str(cfg["weight_peer"])) > Decimal(str(cfg["max_peer_weight"])):
        raise PmsConfigError("weight_peer cannot exceed max_peer_weight")
    if int(cfg["min_peer_responses"]) < 1:
        raise PmsConfigError("min_peer_responses must be at least 1")


def find_slab_overlap(slabs: list[tuple[Decimal, Decimal]]) -> tuple | None:
    """Ranges are half-open [min, max). Returns the first overlapping pair."""
    ordered = sorted(slabs, key=lambda s: s[0])
    for a, b in zip(ordered, ordered[1:]):
        if b[0] < a[1]:
            return a, b
    return None


def pick_slab(slabs: list, score: Decimal):
    """slabs: objects/dicts with min_score, max_score. [min, max) with the
    highest slab inclusive of its max (so a perfect 5.00 still matches)."""
    def g(s, k):
        return Decimal(str(s[k] if isinstance(s, dict) else getattr(s, k)))

    if not slabs:
        return None
    top_max = max(g(s, "max_score") for s in slabs)
    for s in slabs:
        lo, hi = g(s, "min_score"), g(s, "max_score")
        if lo <= score < hi or (hi == top_max and score == hi):
            return s
    return None


_CONFIG_FIELDS = (
    "cycle_frequency", "weight_goals", "weight_competency", "weight_discipline",
    "weight_growth", "weight_manager", "weight_peer", "weight_self", "max_peer_weight",
    "min_peer_responses", "trim_outliers", "peer_anonymous", "goal_achievement_cap",
    "rating_scale_max", "min_tenure_days_for_hike",
)


def _config_dict(cfg: PmsConfig) -> dict:
    return {k: getattr(cfg, k) for k in _CONFIG_FIELDS}


def _jsonable(d: dict) -> dict:
    return {k: (str(v) if isinstance(v, Decimal) else v) for k, v in d.items()}


class PmsConfigService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    # ── Config ───────────────────────────────────────────────
    def get_config(self) -> PmsConfig:
        """Returns the tenant's config, seeding defaults (config, 5
        competency parameters, default slabs) on first access."""
        cfg = self.db.query(PmsConfig).filter(PmsConfig.company_id == self.company_id).first()
        if cfg:
            return cfg
        cfg = PmsConfig(company_id=self.company_id)
        # Column defaults only apply on flush; set explicitly so the
        # object is complete (and validated) before it's returned.
        for k, v in dict(
            cycle_frequency="annual", weight_goals=50, weight_competency=30,
            weight_discipline=10, weight_growth=10, weight_manager=50, weight_peer=30,
            weight_self=20, max_peer_weight=30, min_peer_responses=3, trim_outliers=True,
            peer_anonymous=True, goal_achievement_cap=120, rating_scale_max=5,
            min_tenure_days_for_hike=180,
        ).items():
            setattr(cfg, k, v)
        self.db.add(cfg)
        if not self.db.query(CompetencyParameter).filter(
                CompetencyParameter.company_id == self.company_id).first():
            for i, (name, desc) in enumerate(DEFAULT_PARAMETERS, start=1):
                self.db.add(CompetencyParameter(
                    company_id=self.company_id, name=name, description=desc, display_order=i))
        if not self.db.query(RatingSlab).filter(RatingSlab.company_id == self.company_id).first():
            for label, lo, hi, pct in DEFAULT_SLABS:
                self.db.add(RatingSlab(
                    company_id=self.company_id, label=label, min_score=lo,
                    max_score=hi, hike_percent=pct))
        self.db.commit()
        self.db.refresh(cfg)
        return cfg

    def update_config(self, actor_employee_id: UUID | None, changes: dict) -> PmsConfig:
        cfg = self.get_config()
        changes = {k: v for k, v in changes.items() if v is not None}
        merged = {**_config_dict(cfg), **changes}
        validate_weights(merged)
        old = _config_dict(cfg)
        for k, v in changes.items():
            setattr(cfg, k, v)
        pms_log(self.db, self.company_id, actor_employee_id, "pms.config_updated", "pms_config",
                cfg.id, old_value=_jsonable(old), new_value=_jsonable(_config_dict(cfg)))
        self.db.commit()
        self.db.refresh(cfg)
        return cfg

    # ── Parameters ───────────────────────────────────────────
    def list_parameters(self, include_inactive: bool = False) -> list[CompetencyParameter]:
        self.get_config()  # ensures seeding
        q = self.db.query(CompetencyParameter).filter(
            CompetencyParameter.company_id == self.company_id)
        if not include_inactive:
            q = q.filter(CompetencyParameter.is_active.is_(True))
        return q.order_by(CompetencyParameter.display_order, CompetencyParameter.name).all()

    def _get_parameter(self, parameter_id: UUID) -> CompetencyParameter:
        p = self.db.query(CompetencyParameter).filter(
            CompetencyParameter.id == parameter_id,
            CompetencyParameter.company_id == self.company_id).first()
        if not p:
            raise LookupError("Parameter not found")
        return p

    def _name_taken(self, name: str, exclude_id: UUID | None = None) -> bool:
        q = self.db.query(CompetencyParameter).filter(
            CompetencyParameter.company_id == self.company_id,
            CompetencyParameter.name.ilike(name))
        if exclude_id:
            q = q.filter(CompetencyParameter.id != exclude_id)
        return q.first() is not None

    def _active_count(self) -> int:
        return self.db.query(CompetencyParameter).filter(
            CompetencyParameter.company_id == self.company_id,
            CompetencyParameter.is_active.is_(True)).count()

    def create_parameter(self, actor_employee_id: UUID | None, data: dict) -> CompetencyParameter:
        self.get_config()
        name = data["name"].strip()
        if self._name_taken(name):
            raise PmsConfigError("A parameter with this name already exists")
        if self._active_count() >= MAX_ACTIVE_PARAMETERS:
            raise PmsConfigError(f"At most {MAX_ACTIVE_PARAMETERS} active parameters allowed")
        p = CompetencyParameter(
            company_id=self.company_id, name=name,
            description=data.get("description"), display_order=data.get("display_order", 0))
        self.db.add(p)
        self.db.flush()
        pms_log(self.db, self.company_id, actor_employee_id, "pms.parameter_created",
                "competency_parameter", p.id, new_value={"name": name})
        self.db.commit()
        self.db.refresh(p)
        return p

    def update_parameter(self, actor_employee_id: UUID | None, parameter_id: UUID,
                         changes: dict) -> CompetencyParameter:
        p = self._get_parameter(parameter_id)
        changes = {k: v for k, v in changes.items() if v is not None}
        if "name" in changes:
            changes["name"] = changes["name"].strip()
            if self._name_taken(changes["name"], exclude_id=p.id):
                raise PmsConfigError("A parameter with this name already exists")
        if changes.get("is_active") and not p.is_active and self._active_count() >= MAX_ACTIVE_PARAMETERS:
            raise PmsConfigError(f"At most {MAX_ACTIVE_PARAMETERS} active parameters allowed")
        old = {k: getattr(p, k) for k in changes}
        for k, v in changes.items():
            setattr(p, k, v)
        pms_log(self.db, self.company_id, actor_employee_id, "pms.parameter_updated",
                "competency_parameter", p.id, old_value=old, new_value=changes)
        self.db.commit()
        self.db.refresh(p)
        return p

    # ── Slabs ────────────────────────────────────────────────
    def list_slabs(self) -> list[RatingSlab]:
        self.get_config()
        return (self.db.query(RatingSlab).filter(RatingSlab.company_id == self.company_id)
                .order_by(RatingSlab.min_score).all())

    def _check_overlap(self, candidate: tuple[Decimal, Decimal], exclude_id: UUID | None = None):
        ranges = [(s.min_score, s.max_score) for s in self.list_slabs() if s.id != exclude_id]
        if find_slab_overlap(ranges + [candidate]):
            raise PmsConfigError("Slab score range overlaps an existing slab")

    def create_slab(self, actor_employee_id: UUID | None, data: dict) -> RatingSlab:
        self._check_overlap((data["min_score"], data["max_score"]))
        s = RatingSlab(company_id=self.company_id, **data)
        self.db.add(s)
        self.db.flush()
        pms_log(self.db, self.company_id, actor_employee_id, "pms.slab_created", "rating_slab",
                s.id, new_value=_jsonable(data))
        self.db.commit()
        self.db.refresh(s)
        return s

    def update_slab(self, actor_employee_id: UUID | None, slab_id: UUID, data: dict) -> RatingSlab:
        s = self.db.query(RatingSlab).filter(
            RatingSlab.id == slab_id, RatingSlab.company_id == self.company_id).first()
        if not s:
            raise LookupError("Slab not found")
        self._check_overlap((data["min_score"], data["max_score"]), exclude_id=s.id)
        old = {k: getattr(s, k) for k in data}
        for k, v in data.items():
            setattr(s, k, v)
        pms_log(self.db, self.company_id, actor_employee_id, "pms.slab_updated", "rating_slab",
                s.id, old_value=_jsonable(old), new_value=_jsonable(data))
        self.db.commit()
        self.db.refresh(s)
        return s

    def delete_slab(self, actor_employee_id: UUID | None, slab_id: UUID) -> None:
        s = self.db.query(RatingSlab).filter(
            RatingSlab.id == slab_id, RatingSlab.company_id == self.company_id).first()
        if not s:
            raise LookupError("Slab not found")
        pms_log(self.db, self.company_id, actor_employee_id, "pms.slab_deleted", "rating_slab",
                s.id, old_value=_jsonable({
                    "label": s.label, "min_score": s.min_score,
                    "max_score": s.max_score, "hike_percent": s.hike_percent}))
        self.db.delete(s)
        self.db.commit()
