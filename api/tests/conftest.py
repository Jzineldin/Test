"""Shared fixtures: load the real sample submission + carriers from data/."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.agent import load_carriers
from app.models import Carrier, Submission
from app.parsers import JsonParser

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "data"


@pytest.fixture
def carriers() -> list[Carrier]:
    return load_carriers(DATA / "carriers")


@pytest.fixture
def acme_submission() -> Submission:
    return JsonParser().parse(DATA / "submissions" / "acme_plumbing.json")


def pytest_configure(config):
    """Bypass rate limits by default in tests.

    Each per-module fixture reloads `app.limits`, so resetting the
    originally-imported limiter from a conftest fixture races with the
    reload. Setting absurdly high defaults at the env level means the
    reloaded limiter never trips by accident. Tests that need to
    exercise the rate limiter override these in their own fixtures.
    """
    import os
    os.environ.setdefault("RATE_LIMIT_DEFAULT", "100000/minute")
    os.environ.setdefault("RATE_LIMIT_TRIAGE", "100000/minute")
    os.environ.setdefault("RATE_LIMIT_INBOUND", "100000/minute")
