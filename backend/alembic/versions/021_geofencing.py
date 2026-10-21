"""Geofenced clock-in: company settings, office locations, employee location
requests and per-record location/review columns. Everything defaults to off.

Revision ID: 021_geofencing
Revises: 020_ai_chat_usage
Create Date: 2026-10-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "021_geofencing"
down_revision = "020_ai_chat_usage"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.add_column("company", sa.Column("geofence_enabled", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("company", sa.Column("geofence_mode", sa.String(10), nullable=False, server_default="flag"))

    op.create_table(
        "office_location",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("radius_m", sa.Integer, nullable=False, server_default="100"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
    )

    op.create_table(
        "employee_location_request",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", UUID, sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("radius_m", sa.Integer, nullable=False, server_default="100"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending", index=True),
        sa.Column("reviewed_by_employee_id", UUID, sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.String(500), nullable=True),
        *_ts(),
    )

    op.add_column("attendance_record", sa.Column("latitude", sa.Float, nullable=True))
    op.add_column("attendance_record", sa.Column("longitude", sa.Float, nullable=True))
    op.add_column("attendance_record", sa.Column("accuracy_m", sa.Float, nullable=True))
    op.add_column("attendance_record", sa.Column("distance_m", sa.Float, nullable=True))
    op.add_column("attendance_record", sa.Column("geofence_status", sa.String(20), nullable=True))
    op.add_column("attendance_record", sa.Column("geofence_location_name", sa.String(255), nullable=True))
    op.add_column("attendance_record", sa.Column("geofence_review_status", sa.String(20), nullable=True))
    op.create_index("ix_attendance_record_geofence_review_status", "attendance_record", ["geofence_review_status"])
    op.add_column(
        "attendance_record",
        sa.Column("geofence_reviewed_by", UUID, sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("attendance_record", sa.Column("geofence_reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("attendance_record", sa.Column("geofence_review_note", sa.String(500), nullable=True))
    op.add_column("attendance_record", sa.Column("clock_out_latitude", sa.Float, nullable=True))
    op.add_column("attendance_record", sa.Column("clock_out_longitude", sa.Float, nullable=True))


def downgrade() -> None:
    for col in (
        "clock_out_longitude", "clock_out_latitude", "geofence_review_note", "geofence_reviewed_at",
        "geofence_reviewed_by", "geofence_review_status", "geofence_location_name", "geofence_status",
        "distance_m", "accuracy_m", "longitude", "latitude",
    ):
        if col == "geofence_review_status":
            op.drop_index("ix_attendance_record_geofence_review_status", table_name="attendance_record")
        op.drop_column("attendance_record", col)
    op.drop_table("employee_location_request")
    op.drop_table("office_location")
    op.drop_column("company", "geofence_mode")
    op.drop_column("company", "geofence_enabled")
