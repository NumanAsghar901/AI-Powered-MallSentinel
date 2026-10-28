"""penalties: supervisor decisions about employees, with email delivery status

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-27
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

severity = pg.ENUM("low", "medium", "high", "critical", name="penalty_severity", create_type=False)
action = pg.ENUM("verbal_warning", "written_warning", "fine", "suspension", "other", name="penalty_action", create_type=False)
email_status = pg.ENUM("pending", "sent", "failed", "not_configured", name="email_status", create_type=False)


def upgrade() -> None:
    for e in (severity, action, email_status):
        e.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "penalties",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("employee_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("issued_by_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("department_id", sa.Integer, sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("severity", severity, nullable=False),
        sa.Column("action", action, nullable=False),
        sa.Column("amount_pkr", sa.Integer),
        sa.Column("suspension_days", sa.Integer),
        sa.Column("notes", sa.Text),
        sa.Column("email_status", email_status, nullable=False, server_default="pending"),
        sa.Column("email_sent_at", sa.DateTime(timezone=True)),
        sa.Column("email_error", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "(action = 'fine' AND amount_pkr > 0 AND suspension_days IS NULL) "
            "OR (action = 'suspension' AND suspension_days > 0 AND amount_pkr IS NULL) "
            "OR (action NOT IN ('fine', 'suspension') AND amount_pkr IS NULL AND suspension_days IS NULL)",
            name="ck_penalties_action_details",
        ),
    )
    op.create_index("ix_penalties_employee_id", "penalties", ["employee_id"])
    op.create_index("ix_penalties_issued_by_id", "penalties", ["issued_by_id"])
    op.create_index("ix_penalties_department_id", "penalties", ["department_id"])
    op.create_index("ix_penalties_created_at", "penalties", ["created_at"])


def downgrade() -> None:
    op.drop_table("penalties")
    for e in (email_status, action, severity):
        e.drop(op.get_bind(), checkfirst=True)
