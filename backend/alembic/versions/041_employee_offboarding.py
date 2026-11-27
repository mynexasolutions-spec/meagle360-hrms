"""Employee offboarding: exit details and notice-period tracking.

employment_status stays 'active' during the notice period (payroll,
attendance and dashboards all look for 'active'); offboarding_status
tracks the exit separately: NULL (none) / 'notice' / 'exited'.
Employees who are already inactive with an exit date are backfilled
as 'exited'.

Revision ID: 041_employee_offboarding
Revises: 040_resume_match
Create Date: 2026-11-27
"""

from alembic import op
import sqlalchemy as sa

revision = "041_employee_offboarding"
down_revision = "040_resume_match"
branch_labels = None
depends_on = None

EXIT_TYPES = "('resignation', 'termination', 'retirement', 'absconding', 'contract_end', 'other')"


def upgrade() -> None:
    op.add_column("employee", sa.Column("offboarding_status", sa.String(20), nullable=True))
    op.add_column("employee", sa.Column("exit_type", sa.String(30), nullable=True))
    op.add_column("employee", sa.Column("resignation_date", sa.Date, nullable=True))
    op.add_column("employee", sa.Column("last_working_date", sa.Date, nullable=True))
    op.add_column("employee", sa.Column("offboarding_started_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint(
        "ck_employee_offboarding_status", "employee",
        "offboarding_status IS NULL OR offboarding_status IN ('notice', 'exited')",
    )
    op.create_check_constraint(
        "ck_employee_exit_type", "employee",
        f"exit_type IS NULL OR exit_type IN {EXIT_TYPES}",
    )
    op.create_index("ix_employee_offboarding_status", "employee", ["offboarding_status"])

    op.execute(
        "UPDATE employee SET offboarding_status = 'exited', last_working_date = date_of_exit "
        "WHERE employment_status = 'inactive' AND date_of_exit IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_employee_offboarding_status", table_name="employee")
    op.drop_constraint("ck_employee_exit_type", "employee", type_="check")
    op.drop_constraint("ck_employee_offboarding_status", "employee", type_="check")
    for col in ("offboarding_started_at", "last_working_date", "resignation_date", "exit_type", "offboarding_status"):
        op.drop_column("employee", col)
