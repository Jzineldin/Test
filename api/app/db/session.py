"""Engine + session factory.

Defaults to SQLite for local dev. In production set:
    DATABASE_URL=postgresql+psycopg://user:pass@host/db
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .models import Base

DEFAULT_SQLITE_PATH = Path(__file__).resolve().parents[2] / "submission_triage.db"
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}")

# SQLite needs check_same_thread=False because uvicorn workers reuse threads;
# Postgres ignores connect_args.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, class_=Session)


def init_db() -> None:
    """Idempotent schema bootstrap.

    Tests and local dev hit this; it just calls create_all (fast, no
    process forking, no alembic dependency at test time). For prod
    deploys, see `run_migrations()` — it's the one with version safety.
    """
    Base.metadata.create_all(bind=engine)


def run_migrations() -> None:
    """Run `alembic upgrade head` programmatically.

    Lambda startup calls this so each cold start ensures the schema is
    up to date before the first request lands. Idempotent: a no-op if
    we're already at head.
    """
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    cfg_path = Path(__file__).resolve().parents[2] / "alembic.ini"
    cfg = Config(str(cfg_path))
    cfg.set_main_option("script_location", str(cfg_path.parent / "migrations"))
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    command.upgrade(cfg, "head")


@contextmanager
def session_scope() -> Iterator[Session]:
    """Context manager that commits on success, rolls back on exception."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
