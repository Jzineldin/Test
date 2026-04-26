"""AWS Lambda entrypoint.

Mangum adapts the FastAPI ASGI app to API Gateway / Lambda Function URL
events. SAM and `serverless` both auto-detect the `handler` attribute.

We run alembic migrations on cold start so deploys never serve traffic
against a stale schema. `alembic upgrade head` is idempotent - second
cold start in a warm container is a no-op.
"""
from __future__ import annotations

from mangum import Mangum

from .db.session import run_migrations
from .main import app

run_migrations()

handler = Mangum(app, lifespan="on")
