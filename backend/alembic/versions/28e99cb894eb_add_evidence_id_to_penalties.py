"""add evidence_id to penalties

Revision ID: 28e99cb894eb
Revises: 0003
Create Date: 2026-11-14 18:08:22.994525
"""
from alembic import op
import sqlalchemy as sa


revision = '28e99cb894eb'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "penalties",
        sa.Column(
            "evidence_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("cctv_evidence.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_penalties_evidence_id", "penalties", ["evidence_id"])


def downgrade() -> None:
    op.drop_index("ix_penalties_evidence_id", table_name="penalties")
    op.drop_column("penalties", "evidence_id")
