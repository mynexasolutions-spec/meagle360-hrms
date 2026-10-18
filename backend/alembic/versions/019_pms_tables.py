"""PMS: performance management tables.

Revision ID: 019_pms_tables
Revises: 012_helpdesk
Create Date: 2026-10-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "019_pms_tables"
down_revision = "012_helpdesk"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _pk():
    return sa.Column("id", UUID, primary_key=True)


def _company():
    return sa.Column(
        "company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False, index=True)


def _emp(name, nullable=False, ondelete="CASCADE", index=True):
    return sa.Column(
        name, UUID, sa.ForeignKey("employee.id", ondelete=ondelete),
        nullable=nullable, index=index)


def _cycle(nullable=False):
    return sa.Column(
        "cycle_id", UUID, sa.ForeignKey("review_cycle.id", ondelete="CASCADE"),
        nullable=nullable, index=True)


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "pms_config",
        _pk(),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"),
                  nullable=False, unique=True),
        sa.Column("cycle_frequency", sa.String(20), nullable=False, server_default="annual"),
        sa.Column("weight_goals", sa.Numeric(5, 2), nullable=False, server_default="50"),
        sa.Column("weight_competency", sa.Numeric(5, 2), nullable=False, server_default="30"),
        sa.Column("weight_discipline", sa.Numeric(5, 2), nullable=False, server_default="10"),
        sa.Column("weight_growth", sa.Numeric(5, 2), nullable=False, server_default="10"),
        sa.Column("weight_manager", sa.Numeric(5, 2), nullable=False, server_default="50"),
        sa.Column("weight_peer", sa.Numeric(5, 2), nullable=False, server_default="30"),
        sa.Column("weight_self", sa.Numeric(5, 2), nullable=False, server_default="20"),
        sa.Column("max_peer_weight", sa.Numeric(5, 2), nullable=False, server_default="30"),
        sa.Column("min_peer_responses", sa.SmallInteger, nullable=False, server_default="3"),
        sa.Column("trim_outliers", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("peer_anonymous", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("goal_achievement_cap", sa.Numeric(5, 2), nullable=False, server_default="120"),
        sa.Column("rating_scale_max", sa.SmallInteger, nullable=False, server_default="5"),
        sa.Column("min_tenure_days_for_hike", sa.Integer, nullable=False, server_default="180"),
        *_ts(),
        sa.CheckConstraint(
            "weight_goals + weight_competency + weight_discipline + weight_growth = 100",
            name="ck_pms_config_pillar_weights_100"),
        sa.CheckConstraint(
            "weight_manager + weight_peer + weight_self = 100",
            name="ck_pms_config_rater_weights_100"),
        sa.CheckConstraint("min_peer_responses >= 1", name="ck_pms_config_min_peer_resp"),
        sa.CheckConstraint("max_peer_weight BETWEEN 0 AND 100", name="ck_pms_config_max_peer_weight"),
    )

    op.create_table(
        "competency_parameter",
        _pk(), _company(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
        sa.UniqueConstraint("company_id", "name", name="uq_competency_parameter_company_name"),
    )

    op.create_table(
        "rating_slab",
        _pk(), _company(),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("min_score", sa.Numeric(3, 2), nullable=False),
        sa.Column("max_score", sa.Numeric(3, 2), nullable=False),
        sa.Column("hike_percent", sa.Numeric(5, 2), nullable=False),
        *_ts(),
        sa.CheckConstraint("min_score >= 0 AND max_score > min_score", name="ck_rating_slab_range"),
        sa.CheckConstraint("hike_percent >= 0", name="ck_rating_slab_hike_nonneg"),
    )

    op.create_table(
        "kpi_template",
        _pk(), _company(),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("department_id", UUID, sa.ForeignKey("department.id", ondelete="SET NULL")),
        sa.Column("designation_id", UUID, sa.ForeignKey("designation.id", ondelete="SET NULL")),
        sa.Column("items", postgresql.JSONB, nullable=False, server_default="[]"),
        *_ts(),
    )

    op.create_table(
        "review_cycle",
        _pk(), _company(),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("goal_setting_deadline", sa.Date),
        sa.Column("rating_start", sa.Date),
        sa.Column("rating_end", sa.Date),
        sa.Column("review_end", sa.Date),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("config_snapshot", postgresql.JSONB),
        sa.Column("launched_at", sa.DateTime(timezone=True)),
        sa.Column("finalized_at", sa.DateTime(timezone=True)),
        sa.Column("finalized_by", UUID, sa.ForeignKey("employee.id", ondelete="SET NULL")),
        sa.Column("created_by", UUID, sa.ForeignKey("employee.id", ondelete="SET NULL")),
        *_ts(),
        sa.CheckConstraint("end_date >= start_date", name="ck_review_cycle_dates"),
        sa.CheckConstraint(
            "status IN ('draft','goal_setting','rating','review','finalized',"
            "'released','payroll_approved','closed')",
            name="ck_review_cycle_status"),
    )

    op.create_table(
        "review_participant",
        _pk(), _company(), _cycle(), _emp("employee_id"),
        _emp("manager_id", nullable=True, ondelete="SET NULL"),
        sa.Column("department_id", UUID, sa.ForeignKey("department.id", ondelete="SET NULL")),
        sa.Column("designation_id", UUID, sa.ForeignKey("designation.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("goals_score", sa.Numeric(4, 2)),
        sa.Column("competency_score", sa.Numeric(4, 2)),
        sa.Column("discipline_score", sa.Numeric(4, 2)),
        sa.Column("growth_score", sa.Numeric(4, 2)),
        sa.Column("self_avg", sa.Numeric(4, 2)),
        sa.Column("manager_avg", sa.Numeric(4, 2)),
        sa.Column("peer_avg", sa.Numeric(4, 2)),
        sa.Column("peer_response_count", sa.SmallInteger, nullable=False, server_default="0"),
        sa.Column("peer_score_insufficient", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("final_score", sa.Numeric(4, 2)),
        sa.Column("final_rating_label", sa.String(100)),
        sa.Column("adjusted_score", sa.Numeric(4, 2)),
        sa.Column("adjustment_reason", sa.Text),
        sa.Column("attendance_snapshot", postgresql.JSONB),
        sa.Column("parameter_breakdown", postgresql.JSONB),
        sa.Column("locked_at", sa.DateTime(timezone=True)),
        sa.Column("released_at", sa.DateTime(timezone=True)),
        *_ts(),
        sa.UniqueConstraint("cycle_id", "employee_id", name="uq_review_participant_cycle_employee"),
    )

    op.create_table(
        "review_assignment",
        _pk(), _company(), _cycle(), _emp("ratee_id"), _emp("rater_id"),
        sa.Column("rater_type", sa.String(10), nullable=False),
        sa.Column("status", sa.String(15), nullable=False, server_default="pending"),
        sa.Column("assigned_by", sa.String(10), nullable=False, server_default="system"),
        sa.Column("submitted_at", sa.DateTime(timezone=True)),
        *_ts(),
        sa.UniqueConstraint("cycle_id", "ratee_id", "rater_id", name="uq_review_assignment_trio"),
        sa.CheckConstraint("rater_type IN ('self','manager','peer')", name="ck_review_assignment_type"),
        sa.CheckConstraint("(rater_type = 'self') = (rater_id = ratee_id)", name="ck_review_assignment_self"),
    )

    op.create_table(
        "rating",
        _pk(), _company(),
        sa.Column("assignment_id", UUID, sa.ForeignKey("review_assignment.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("parameter_id", UUID, sa.ForeignKey("competency_parameter.id", ondelete="CASCADE"),
                  nullable=False),
        _cycle(), _emp("ratee_id"),
        sa.Column("rater_type", sa.String(10), nullable=False),
        sa.Column("score", sa.SmallInteger, nullable=False),
        sa.Column("comment", sa.Text),
        *_ts(),
        sa.UniqueConstraint("assignment_id", "parameter_id", name="uq_rating_assignment_parameter"),
        sa.CheckConstraint("score BETWEEN 1 AND 5", name="ck_rating_score_1_5"),
    )

    op.create_table(
        "goal",
        _pk(), _company(), _cycle(), _emp("employee_id"),
        sa.Column("kpi_template_id", UUID, sa.ForeignKey("kpi_template.id", ondelete="SET NULL")),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("category", sa.String(20), nullable=False, server_default="output"),
        sa.Column("weight", sa.Numeric(5, 2), nullable=False),
        sa.Column("target_value", sa.Numeric(14, 2), nullable=False, server_default="100"),
        sa.Column("unit", sa.String(30)),
        sa.Column("direction", sa.String(15), nullable=False, server_default="higher_better"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("approved_by", UUID, sa.ForeignKey("employee.id", ondelete="SET NULL")),
        sa.Column("final_achievement_pct", sa.Numeric(6, 2)),
        *_ts(),
        sa.CheckConstraint("weight > 0 AND weight <= 100", name="ck_goal_weight"),
        sa.CheckConstraint("direction IN ('higher_better','lower_better')", name="ck_goal_direction"),
        sa.CheckConstraint(
            "status IN ('draft','pending_approval','approved','locked')", name="ck_goal_status"),
    )

    op.create_table(
        "goal_progress",
        _pk(), _company(),
        sa.Column("goal_id", UUID, sa.ForeignKey("goal.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("recorded_on", sa.Date, nullable=False),
        sa.Column("actual_value", sa.Numeric(14, 2), nullable=False),
        sa.Column("achievement_pct", sa.Numeric(6, 2), nullable=False),
        sa.Column("note", sa.Text),
        sa.Column("recorded_by", UUID, sa.ForeignKey("employee.id", ondelete="SET NULL")),
        *_ts(),
    )

    op.create_table(
        "payroll_revision",
        _pk(), _company(),
        sa.Column("participant_id", UUID, sa.ForeignKey("review_participant.id", ondelete="CASCADE"),
                  nullable=False, unique=True),
        _cycle(), _emp("employee_id"),
        sa.Column("current_basic_pay", sa.Numeric(12, 2)),
        sa.Column("current_annual_ctc", sa.Numeric(12, 2)),
        sa.Column("suggested_hike_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("approved_hike_percent", sa.Numeric(5, 2)),
        sa.Column("override_reason", sa.Text),
        sa.Column("new_basic_pay", sa.Numeric(12, 2)),
        sa.Column("new_annual_ctc", sa.Numeric(12, 2)),
        sa.Column("effective_date", sa.Date),
        sa.Column("status", sa.String(15), nullable=False, server_default="suggested"),
        sa.Column("eligible", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("ineligible_reason", sa.String(255)),
        sa.Column("approved_by", UUID, sa.ForeignKey("employee.id", ondelete="SET NULL")),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("salary_assignment_id", UUID,
                  sa.ForeignKey("employee_salary_assignment.id", ondelete="SET NULL")),
        *_ts(),
        sa.CheckConstraint(
            "status IN ('suggested','approved','rejected','applied')",
            name="ck_payroll_revision_status"),
    )

    op.create_table(
        "pms_audit_log",
        _pk(), _company(), _cycle(nullable=True),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", UUID),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("old_value", postgresql.JSONB),
        sa.Column("new_value", postgresql.JSONB),
        sa.Column("reason", sa.Text),
        sa.Column("actor_employee_id", UUID, sa.ForeignKey("employee.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    for t in (
        "pms_audit_log", "payroll_revision", "goal_progress", "goal", "rating",
        "review_assignment", "review_participant", "review_cycle", "kpi_template",
        "rating_slab", "competency_parameter", "pms_config",
    ):
        op.drop_table(t)
