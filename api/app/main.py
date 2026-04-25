"""FastAPI app — minimal HTTP surface for the triage agent.

Endpoints:
    POST /triage              — run triage on a normalized Submission JSON body
    GET  /carriers            — list loaded carriers
    GET  /healthz             — liveness

Auth, persistence, file upload, and Stripe ACP land in the next iteration.
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .agent import load_carriers, triage_submission
from .llm import get_client
from .models import Carrier, Submission, TriageResult
from .parsers.base import DocAiParser

CARRIERS_DIR = Path(os.environ.get(
    "CARRIERS_DIR",
    Path(__file__).resolve().parents[2] / "data" / "carriers",
))

app = FastAPI(title="Submission Triage Agent", version="0.1.0")

# Dashboard runs on localhost:3000 in dev; tighten to specific origins in prod.
_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


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


@app.post("/triage", response_model=TriageResult)
def triage(submission: Submission) -> TriageResult:
    return triage_submission(submission, _carriers_or_503(), llm=get_client())


@app.post("/triage/upload", response_model=TriageResult)
async def triage_upload(file: UploadFile = File(...)) -> TriageResult:
    """Accept an ACORD PDF, parse via DocAI, then run the full triage flow."""
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(415, detail=f"Unsupported content type: {file.content_type}")
    pdf_bytes = await file.read()
    try:
        submission = DocAiParser().parse_bytes(pdf_bytes)
    except RuntimeError as e:
        raise HTTPException(503, detail=str(e)) from e
    return triage_submission(submission, _carriers_or_503(), llm=get_client())
