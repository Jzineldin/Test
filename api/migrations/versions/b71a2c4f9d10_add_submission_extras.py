"""add submission_extras to triage_runs

Revision ID: b71a2c4f9d10
Revises: f0cba7e9af3d
Create Date: 2026-04-26 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b71a2c4f9d10'
down_revision: Union[str, None] = 'a3a1d35ded26'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('triage_runs', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'submission_extras', sa.JSON(), nullable=True,
        ))


def downgrade() -> None:
    with op.batch_alter_table('triage_runs', schema=None) as batch_op:
        batch_op.drop_column('submission_extras')
