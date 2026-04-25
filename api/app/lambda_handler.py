"""AWS Lambda entrypoint.

Mangum adapts the FastAPI ASGI app to API Gateway / Lambda Function URL
events. SAM and `serverless` both auto-detect the `handler` attribute.
"""
from __future__ import annotations

from mangum import Mangum

from .main import app

handler = Mangum(app, lifespan="on")
