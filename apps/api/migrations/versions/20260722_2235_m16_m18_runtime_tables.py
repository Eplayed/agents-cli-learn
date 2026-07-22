"""m16 m18 runtime tables

Revision ID: m16_m18_runtime
Revises: 643015c1c582
Create Date: 2026-07-22 22:35:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "m16_m18_runtime"
down_revision: Union[str, None] = "643015c1c582"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_memories",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_memories_key"), "user_memories", ["key"], unique=False)
    op.create_index(op.f("ix_user_memories_session_id"), "user_memories", ["session_id"], unique=False)
    op.create_index(op.f("ix_user_memories_user_id"), "user_memories", ["user_id"], unique=False)

    op.create_table(
        "uploaded_files",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("media_type", sa.String(length=120), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("text_path", sa.Text(), nullable=True),
        sa.Column("text_preview", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_uploaded_files_session_id"), "uploaded_files", ["session_id"], unique=False)
    op.create_index(op.f("ix_uploaded_files_user_id"), "uploaded_files", ["user_id"], unique=False)

    op.create_table(
        "scheduled_tasks",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("agent_key", sa.String(length=50), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("interval_seconds", sa.Integer(), nullable=True),
        sa.Column("next_run_at", sa.DateTime(), nullable=True),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("max_runs", sa.Integer(), nullable=True),
        sa.Column("run_count", sa.Integer(), nullable=False),
        sa.Column("overlap_policy", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scheduled_tasks_enabled"), "scheduled_tasks", ["enabled"], unique=False)
    op.create_index(op.f("ix_scheduled_tasks_next_run_at"), "scheduled_tasks", ["next_run_at"], unique=False)
    op.create_index(op.f("ix_scheduled_tasks_session_id"), "scheduled_tasks", ["session_id"], unique=False)
    op.create_index(op.f("ix_scheduled_tasks_user_id"), "scheduled_tasks", ["user_id"], unique=False)

    op.create_table(
        "scheduled_task_runs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("task_id", sa.String(length=64), nullable=False),
        sa.Column("agent_run_id", sa.String(length=64), nullable=True),
        sa.Column("trigger", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["scheduled_tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scheduled_task_runs_agent_run_id"), "scheduled_task_runs", ["agent_run_id"], unique=False)
    op.create_index(op.f("ix_scheduled_task_runs_task_id"), "scheduled_task_runs", ["task_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_scheduled_task_runs_task_id"), table_name="scheduled_task_runs")
    op.drop_index(op.f("ix_scheduled_task_runs_agent_run_id"), table_name="scheduled_task_runs")
    op.drop_table("scheduled_task_runs")
    op.drop_index(op.f("ix_scheduled_tasks_user_id"), table_name="scheduled_tasks")
    op.drop_index(op.f("ix_scheduled_tasks_session_id"), table_name="scheduled_tasks")
    op.drop_index(op.f("ix_scheduled_tasks_next_run_at"), table_name="scheduled_tasks")
    op.drop_index(op.f("ix_scheduled_tasks_enabled"), table_name="scheduled_tasks")
    op.drop_table("scheduled_tasks")
    op.drop_index(op.f("ix_uploaded_files_user_id"), table_name="uploaded_files")
    op.drop_index(op.f("ix_uploaded_files_session_id"), table_name="uploaded_files")
    op.drop_table("uploaded_files")
    op.drop_index(op.f("ix_user_memories_user_id"), table_name="user_memories")
    op.drop_index(op.f("ix_user_memories_session_id"), table_name="user_memories")
    op.drop_index(op.f("ix_user_memories_key"), table_name="user_memories")
    op.drop_table("user_memories")
