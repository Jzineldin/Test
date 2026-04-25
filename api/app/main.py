"""FastAPI app — HTTP surface for the triage agent.

Endpoints:
    POST /triage              — run triage on a normalized Submission JSON body
    POST /triage/upload       — upload an ACORD PDF, parse via DocAI, then triage
    GET  /carriers            — list loaded carrier appetite guides
    GET  /history             — recent triage runs (most recent first)
    GET  /history/{run_id}    — single triage run with matches + drafts
    GET  /healthz             — liveness
"""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .agent import load_carriers, triage_submission
from .db import (
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

app = FastAPI(title="Submission Triage Agent", version="0.1.0")

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


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/carriers", response_model=list[Carrier])
def list_carriers() -> list[Carrier]:
    return load_carriers(CARRIERS_DIR)


def _carriers_or_503() -> list[Carrier]:
    carriers = load_carriers(CARRIERS_DIR)
    if not carriers:
        raise HTTPException(503, detail="No carrier appetite guides loaded")
    return carriers


def _run_and_persist(submission: Submission) -> TriageResult:
    result = triage_submission(submission, _carriers_or_503(), llm=get_client())
    with session_scope() as session:
        save_triage_run(session, submission, result)
    return result


@app.post("/triage", response_model=TriageResult)
def triage(submission: Submission) -> TriageResult:
    return _run_and_persist(submission)


@app.post("/triage/upload", response_model=TriageResult)
async def triage_upload(file: UploadFile = File(...)) -> TriageResult:
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(415, detail=f"Unsupported content type: {file.content_type}")
    pdf_bytes = await file.read()
    try:
        submission = DocAiParser().parse_bytes(pdf_bytes)
    except RuntimeError as e:
        raise HTTPException(503, detail=str(e)) from e
    return _run_and_persist(submission)


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
def history(limit: int = 50) -> list[TriageRunSummary]:
    with session_scope() as session:
        runs = list_triage_runs(session, limit=limit)
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
def history_detail(run_id: int) -> TriageRunDetail:
    with session_scope() as session:
        run = get_triage_run(session, run_id)
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
