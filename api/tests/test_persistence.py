"""Persistence tests — fresh in-memory SQLite per test, no file I/O.

Verifies that save_triage_run captures matches + drafts, list_triage_runs
returns most-recent-first, and get_triage_run hydrates relationships.
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.agent import triage_submission
from app.db.models import Base
from app.db.repository import get_triage_run, list_triage_runs, save_triage_run
from app.llm.client import StubClient


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    s = Session()
    try:
        yield s
    finally:
        s.close()


def test_save_persists_matches_and_drafts(session, carriers, acme_submission):
    result = triage_submission(acme_submission, carriers, llm=StubClient())
    run = save_triage_run(session, acme_submission, result)
    session.commit()

    assert run.id is not None
    assert run.insured_name == "Acme Plumbing Services LLC"
    assert run.primary_state == "TX"
    assert len(run.matches) == len(result.matches)
    assert len(run.drafts) == len(result.drafted_emails)


def test_save_round_trips_match_fields(session, carriers, acme_submission):
    result = triage_submission(acme_submission, carriers, llm=StubClient())
    run = save_triage_run(session, acme_submission, result)
    session.commit()

    saved_first = run.matches[0]
    src_first = result.matches[0]
    assert saved_first.carrier_id == src_first.carrier_id
    assert saved_first.score == pytest.approx(src_first.score)
    assert saved_first.risk_flags == list(src_first.risk_flags)


def test_list_returns_most_recent_first(session, carriers, acme_submission):
    result = triage_submission(acme_submission, carriers, llm=StubClient())
    save_triage_run(session, acme_submission, result)
    session.commit()

    result.submission_id = "SUB-2026-04-9999"
    save_triage_run(session, acme_submission, result)
    session.commit()

    runs = list_triage_runs(session, limit=10)
    assert len(runs) == 2
    assert runs[0].submission_id == "SUB-2026-04-9999"
    assert runs[1].submission_id == "SUB-2026-04-1042"


def test_get_run_hydrates_relationships(session, carriers, acme_submission):
    result = triage_submission(acme_submission, carriers, llm=StubClient())
    saved = save_triage_run(session, acme_submission, result)
    session.commit()
    run_id = saved.id
    session.expire_all()

    fetched = get_triage_run(session, run_id)
    assert fetched is not None
    assert fetched.matches, "matches should be eager-loaded"
    assert fetched.drafts, "drafts should be eager-loaded"


def test_get_missing_returns_none(session):
    assert get_triage_run(session, 99999) is None


def test_submission_json_round_trips(session, carriers, acme_submission):
    result = triage_submission(acme_submission, carriers, llm=StubClient())
    saved = save_triage_run(session, acme_submission, result)
    session.commit()

    raw = saved.submission_json
    assert raw["insured"]["legal_name"] == "Acme Plumbing Services LLC"
    assert raw["coverages"][0]["line"] == "general_liability"
