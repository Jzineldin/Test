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

from fastapi import FastAPI, HTTPException

from .agent import load_carriers, triage_submission
from .llm import get_client
from .models import Carrier, Submission, TriageResult

CARRIERS_DIR = Path(os.environ.get(
    "CARRIERS_DIR",
    Path(__file__).resolve().parents[2] / "data" / "carriers",
))

app = FastAPI(title="Submission Triage Agent", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/carriers", response_model=list[Carrier])
def list_carriers() -> list[Carrier]:
    return load_carriers(CARRIERS_DIR)


@app.post("/triage", response_model=TriageResult)
def triage(submission: Submission) -> TriageResult:
    carriers = load_carriers(CARRIERS_DIR)
    if not carriers:
        raise HTTPException(503, detail="No carrier appetite guides loaded")
    return triage_submission(submission, carriers, llm=get_client())
