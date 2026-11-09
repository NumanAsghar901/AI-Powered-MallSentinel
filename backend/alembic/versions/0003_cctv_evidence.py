"""cctv_evidence: simulated/real CCTV detection records with review status

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-09
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

review_status = pg.ENUM("pending", "approved", "rejected", name="evidence_review_status", create_type=False)
severity = pg.ENUM("low", "medium", "high", "critical", name="penalty_severity", create_type=False)


def upgrade() -> None:
    review_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "cctv_evidence",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("evidence_source", sa.String(20), nullable=False, server_default="DUMMY"),
        sa.Column("department_id", sa.Integer, sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("employee_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("camera_id", sa.String(50), nullable=False),
        sa.Column("camera_location", sa.String(100), nullable=False),
        sa.Column("violation_type", sa.String(100), nullable=False),
        sa.Column("severity", severity, nullable=False),
        sa.Column("confidence_score", sa.Float, nullable=False),
        sa.Column("detection_labels", pg.JSONB, nullable=False),
        sa.Column("image_url", sa.String(500), nullable=False),
        sa.Column("image_filename", sa.String(255), nullable=True),
        sa.Column("cloudinary_public_id", sa.String(255), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("review_status", review_status, nullable=False, server_default="pending"),
        sa.Column("reviewed_by_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("supervisor_remarks", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_cctv_evidence_evidence_source", "cctv_evidence", ["evidence_source"])
    op.create_index("ix_cctv_evidence_department_id", "cctv_evidence", ["department_id"])
    op.create_index("ix_cctv_evidence_employee_id", "cctv_evidence", ["employee_id"])
    op.create_index("ix_cctv_evidence_camera_id", "cctv_evidence", ["camera_id"])
    op.create_index("ix_cctv_evidence_violation_type", "cctv_evidence", ["violation_type"])
    op.create_index("ix_cctv_evidence_review_status", "cctv_evidence", ["review_status"])
    op.create_index("ix_cctv_evidence_captured_at", "cctv_evidence", ["captured_at"])
    op.create_index("ix_cctv_evidence_created_at", "cctv_evidence", ["created_at"])


def downgrade() -> None:
    op.drop_table("cctv_evidence")
    review_status.drop(op.get_bind(), checkfirst=True)

