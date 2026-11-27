"""Resume parsing + job-match score.

Adds parse/score fields to applications and skill/experience requirements to
job openings. min_experience_years is backfilled from the free-text
experience_range ("2-4 years" -> 2).

Revision ID: 040_resume_match
Revises: 039_scheduled_and_vacancies
Create Date: 2026-11-27
"""

from alembic import op
import sqlalchemy as sa

revision = "040_resume_match"
down_revision = "039_scheduled_and_vacancies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Job openings: structured requirements used by the scorer
    op.add_column("job_openings", sa.Column("required_skills", sa.JSON, nullable=False, server_default="[]"))
    op.add_column("job_openings", sa.Column("preferred_skills", sa.JSON, nullable=False, server_default="[]"))
    op.add_column("job_openings", sa.Column("min_experience_years", sa.Numeric(4, 1), nullable=True))

    # Applications: parser output (suggestions), recruiter edits, score
    op.add_column("applications", sa.Column("parse_status", sa.String(20), nullable=True))
    op.add_column("applications", sa.Column("parse_error", sa.String(255), nullable=True))
    op.add_column("applications", sa.Column("parsed_data", sa.JSON, nullable=True))
    op.add_column("applications", sa.Column("parsed_overrides", sa.JSON, nullable=True))
    op.add_column("applications", sa.Column("parsed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("applications", sa.Column("parser_version", sa.Integer, nullable=True))
    op.add_column("applications", sa.Column("match_score", sa.Numeric(5, 2), nullable=True))
    op.add_column("applications", sa.Column("match_breakdown", sa.JSON, nullable=True))
    op.add_column("applications", sa.Column("scored_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("applications", sa.Column("score_version", sa.Integer, nullable=True))
    op.create_check_constraint(
        "ck_applications_parse_status", "applications",
        "parse_status IS NULL OR parse_status IN ('pending', 'processing', 'done', 'failed')",
    )
    op.create_index("ix_applications_job_match_score", "applications", ["job_id", "match_score"])
    op.create_index("ix_applications_parse_status", "applications", ["parse_status"])

    # Backfill min_experience_years from the first number in experience_range
    op.execute(
        "UPDATE job_openings "
        "SET min_experience_years = LEAST(CAST(substring(experience_range FROM '[0-9]+[.]?[0-9]*') AS NUMERIC), 99) "
        "WHERE experience_range ~ '[0-9]'"
    )


def downgrade() -> None:
    op.drop_index("ix_applications_parse_status", table_name="applications")
    op.drop_index("ix_applications_job_match_score", table_name="applications")
    op.drop_constraint("ck_applications_parse_status", "applications", type_="check")
    for col in ("score_version", "scored_at", "match_breakdown", "match_score", "parser_version",
                "parsed_at", "parsed_overrides", "parsed_data", "parse_error", "parse_status"):
        op.drop_column("applications", col)
    for col in ("min_experience_years", "preferred_skills", "required_skills"):
        op.drop_column("job_openings", col)
