"""Selfie verification for clock-in: company toggle (default off), employee
reference photo profiles and per-record face match result/review columns.

Revision ID: 022_selfie_verification
Revises: 021_geofencing
Create Date: 2026-10-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "022_selfie_verification"
down_revision = "021_geofencing"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column("company", sa.Column("face_verification_enabled", sa.Boolean, nullable=False, server_default=sa.false()))

    op.create_table(
        "employee_face_profile",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", UUID, sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("photo_url", sa.String(500), nullable=False),
        sa.Column("embedding", sa.JSON, nullable=False),
        sa.Column("consent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending", index=True),
        sa.Column("reviewed_by", UUID, sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.add_column("attendance_record", sa.Column("face_status", sa.String(20), nullable=True))
    op.add_column("attendance_record", sa.Column("face_score", sa.Float, nullable=True))
    op.add_column("attendance_record", sa.Column("face_flag_reason", sa.String(50), nullable=True))
    op.add_column("attendance_record", sa.Column("face_review_status", sa.String(20), nullable=True))
    op.create_index("ix_attendance_record_face_review_status", "attendance_record", ["face_review_status"])
    op.add_column("attendance_record", sa.Column(
        "face_reviewed_by", UUID, sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True))
    op.add_column("attendance_record", sa.Column("face_reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("attendance_record", sa.Column("face_review_note", sa.String(500), nullable=True))


def downgrade() -> None:
    for col in ("face_review_note", "face_reviewed_at", "face_reviewed_by"):
        op.drop_column("attendance_record", col)
    op.drop_index("ix_attendance_record_face_review_status", table_name="attendance_record")
    for col in ("face_review_status", "face_flag_reason", "face_score", "face_status"):
        op.drop_column("attendance_record", col)
    op.drop_table("employee_face_profile")
    op.drop_column("company", "face_verification_enabled")
