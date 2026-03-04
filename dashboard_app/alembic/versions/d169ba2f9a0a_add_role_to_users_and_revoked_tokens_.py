"""add role to users and revoked_tokens table

Revision ID: d169ba2f9a0a
Revises: 
Create Date: 2026-03-04 13:16:00.943936

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'd169ba2f9a0a'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    # --- users.role column ---
    if "users" in existing_tables:
        columns = [c["name"] for c in inspector.get_columns("users")]
        if "role" not in columns:
            op.add_column("users", sa.Column("role", sa.String(20), nullable=True))
            op.execute("""
                UPDATE users SET role = 'super_admin'
                WHERE username = 'admin'
            """)
            op.execute("""
                UPDATE users SET role = 'user'
                WHERE role IS NULL
            """)
            op.alter_column("users", "role", nullable=False)

    # --- revoked_tokens table ---
    if "revoked_tokens" not in existing_tables:
        op.create_table(
            "revoked_tokens",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("jti", sa.String(36), nullable=False, unique=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_revoked_tokens_jti", "revoked_tokens", ["jti"])
        op.create_index("ix_revoked_tokens_expires", "revoked_tokens", ["expires_at"])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    if "revoked_tokens" in existing_tables:
        op.drop_index('ix_revoked_tokens_jti', table_name='revoked_tokens')
        op.drop_index('ix_revoked_tokens_expires', table_name='revoked_tokens')
        op.drop_table('revoked_tokens')

    if "users" in existing_tables:
        columns = [c["name"] for c in inspector.get_columns("users")]
        if "role" in columns:
            op.drop_column("users", "role")
