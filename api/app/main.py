"""FastAPI app — HTTP surface for the triage agent.

Auth: every triage/history endpoint requires `Authorization: Bearer <key>`.
The demo seed creates one Org with a well-known key (see /me to fetch it).
"""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .agent import load_carriers, triage_submission
from .auth import CurrentOrg, current_org
from .db import (
    ensure_demo_org,
    get_triage_run,
    init_db,
    list_triage_runs,
    save_triage_run,
    session_scope,
)
from .llm import get_client
from .models import Carrier, Submission, TriageResult
from .parsers.base import DocAiParser

CARRIERS_DIR = Path(os.environ.get(
    "CARRIERS_DIR",
    Path(__file__).resolve().parents[2] / "data" / "carriers",
))

app = FastAPI(title="Submission Triage Agent", version="0.2.0")

_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()
    with session_scope() as session:
        ensure_demo_org(session)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/me")
def me(org: CurrentOrg = Depends(current_org)) -> dict[str, Any]:
    return {
        "org_id": org.id,
        "org_name": org.name,
        "slug": org.slug,
        "plan": org.plan,
        "monthly_submission_quota": org.monthly_submission_quota,
    }


@app.get("/carriers", response_model=list[Carrier])
def list_carriers(_: CurrentOrg = Depends(current_org)) -> list[Carrier]:
    return load_carriers(CARRIERS_DIR)


def _carriers_or_503() -> list[Carrier]:
    carriers = load_carriers(CARRIERS_DIR)
    if not carriers:
        raise HTTPException(503, detail="No carrier appetite guides loaded")
    return carriers


def _run_and_persist(submission: Submission, org_id: int) -> TriageResult:
    result = triage_submission(submission, _carriers_or_503(), llm=get_client())
    with session_scope() as session:
        save_triage_run(session, submission, result, org_id=org_id)
    return result


@app.post("/triage", response_model=TriageResult)
def triage(
    submission: Submission, org: CurrentOrg = Depends(current_org),
) -> TriageResult:
    return _run_and_persist(submission, org_id=org.id)


@app.post("/triage/upload", response_model=TriageResult)
async def triage_upload(
    file: UploadFile = File(...),
    org: CurrentOrg = Depends(current_org),
) -> TriageResult:
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(415, detail=f"Unsupported content type: {file.content_type}")
    pdf_bytes = await file.read()
    try:
        submission = DocAiParser().parse_bytes(pdf_bytes)
    except RuntimeError as e:
        raise HTTPException(503, detail=str(e)) from e
    return _run_and_persist(submission, org_id=org.id)


# ---- History ---------------------------------------------------------------

class TriageRunSummary(BaseModel):
    id: int
    submission_id: str
    insured_name: str
    primary_state: str
    match_count: int
    draft_count: int
    created_at: datetime


class TriageRunDetail(TriageRunSummary):
    summary: str
    submission_json: dict[str, Any]
    result: TriageResult


@app.get("/history", response_model=list[TriageRunSummary])
def history(
    limit: int = 50, org: CurrentOrg = Depends(current_org),
) -> list[TriageRunSummary]:
    with session_scope() as session:
        runs = list_triage_runs(session, org_id=org.id, limit=limit)
        return [
            TriageRunSummary(
                id=r.id,
                submission_id=r.submission_id,
                insured_name=r.insured_name,
                primary_state=r.primary_state,
                match_count=len(r.matches),
                draft_count=len(r.drafts),
                created_at=r.created_at,
            )
            for r in runs
        ]


@app.get("/history/{run_id}", response_model=TriageRunDetail)
def history_detail(
    run_id: int, org: CurrentOrg = Depends(current_org),
) -> TriageRunDetail:
    with session_scope() as session:
        run = get_triage_run(session, run_id, org_id=org.id)
        if run is None:
            raise HTTPException(404, detail=f"Triage run {run_id} not found")
        result = TriageResult(
            submission_id=run.submission_id,
            summary=run.summary,
            matches=[
                {
                    "carrier_id": m.carrier_id,
                    "carrier_name": m.carrier_name,
                    "score": m.score,
                    "rationale": m.rationale,
                    "risk_flags": m.risk_flags,
                    "submission_email": m.submission_email,
                    "typical_quote_back_days": m.typical_quote_back_days,
                }
                for m in run.matches
            ],
            drafted_emails=[
                {
                    "carrier_id": d.carrier_id,
                    "to": d.to,
                    "subject": d.subject,
                    "body": d.body,
                    "attachments": d.attachments,
                }
                for d in run.drafts
            ],
        )
        return TriageRunDetail(
            id=run.id,
            submission_id=run.submission_id,
            insured_name=run.insured_name,
            primary_state=run.primary_state,
            match_count=len(run.matches),
            draft_count=len(run.drafts),
            created_at=run.created_at,
            summary=run.summary,
            submission_json=run.submission_json,
            result=result,
        )
