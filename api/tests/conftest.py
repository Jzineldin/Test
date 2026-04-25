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
