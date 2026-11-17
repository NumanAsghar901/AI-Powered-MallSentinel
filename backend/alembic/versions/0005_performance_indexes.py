"""Add performance indexes for users, penalties, and cctv_evidence

Revision ID: 0005_perf
Revises: 28e99cb894eb
Create Date: 2026-11-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_perf"
down_revision = "28e99cb894eb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users composite indexes
    op.create_index(
        "ix_users_role_status",
        "users",
        ["role", "status"],
        postgresql_using="btree",
    )
    op.create_index(
        "ix_users_role_created_at",
        "users",
        ["role", sa.text("created_at DESC")],
        postgresql_using="btree",
    )
    op.create_index(
        "ix_users_role_last_login",
        "users",
        ["role", sa.text("last_login_at DESC NULLS LAST")],
        postgresql_using="btree",
    )

    # Penalties composite indexes
    op.create_index(
        "ix_penalties_dept_created",
        "penalties",
        ["department_id", sa.text("created_at DESC")],
        postgresql_using="btree",
    )
    op.create_index(
        "ix_penalties_emp_created",
        "penalties",
        ["employee_id", sa.text("created_at DESC")],
        postgresql_using="btree",
    )

    # CCTV Evidence composite indexes
    op.create_index(
        "ix_cctv_evidence_dept_status_captured",
        "cctv_evidence",
        ["department_id", "review_status", sa.text("captured_at DESC")],
        postgresql_using="btree",
    )
    op.create_index(
        "ix_cctv_evidence_captured_desc",
        "cctv_evidence",
        [sa.text("captured_at DESC"), sa.text("created_at DESC")],
        postgresql_using="btree",
    )


def downgrade() -> None:
    op.drop_index("ix_cctv_evidence_captured_desc", table_name="cctv_evidence")
    op.drop_index("ix_cctv_evidence_dept_status_captured", table_name="cctv_evidence")
    op.drop_index("ix_penalties_emp_created", table_name="penalties")
    op.drop_index("ix_penalties_dept_created", table_name="penalties")
    op.drop_index("ix_users_role_last_login", table_name="users")
    op.drop_index("ix_users_role_created_at", table_name="users")
    op.drop_index("ix_users_role_status", table_name="users")
