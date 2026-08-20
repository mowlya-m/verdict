"""FastAPI service over the decision core.

Thin by design. The route validates, maps, calls a pure function and maps back.
No decision logic lives here, and none should. If a rule ever needs changing,
the diff belongs in `engine.py` or `health_engine.py`, where it is unit tested
and reproducible.

    uvicorn verdict.api.main:app --reload --port 8000

Docs at /docs, schema at /openapi.json.
"""

from __future__ import annotations

import logging
import os
from datetime import date

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from verdict.engine import decide
from verdict.health_engine import decide_health

from .mapping import (
    ENGINE_VERSION,
    to_claim,
    to_decision,
    to_membership,
    to_service,
)
from .models import DecisionOut, ErrorOut, HealthClaimIn, MotorClaimIn

log = logging.getLogger("verdict")

app = FastAPI(
    title="Verdict",
    version=ENGINE_VERSION,
    summary="Deterministic claims decisions for Australian general insurance",
    description=(
        "Every outcome comes from a pure function with no model call. Agents "
        "supply evidence, the engine supplies the verdict, and the reasons "
        "record cites the clauses relied on.\n\n"
        "There is no confidence score in any response. The gate trace is the "
        "audit trail."
    ),
)

# Origins come from the environment so the deployed console can be allowed
# without a code change, and so a wildcard cannot reach production by accident.
# A wildcard here would let any site on the internet drive the decision engine
# from a visitor's browser.
DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
_configured = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
ALLOWED_ORIGINS = _configured or DEV_ORIGINS

if "*" in ALLOWED_ORIGINS:
    raise RuntimeError("ALLOWED_ORIGINS must name origins explicitly. Wildcards are refused.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    max_age=600,
)


@app.get("/health", tags=["meta"])
def healthcheck() -> dict[str, str]:
    """Liveness probe. Named for the convention, unrelated to health insurance."""
    return {"status": "ok", "engine": ENGINE_VERSION}


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    """Point a curious visitor at the docs rather than returning a bare 404."""
    return {"service": "verdict", "version": ENGINE_VERSION, "docs": "/docs"}


@app.post(
    "/claims/motor/decide",
    response_model=DecisionOut,
    responses={422: {"model": ErrorOut}},
    tags=["decisions"],
)
def decide_motor(body: MotorClaimIn, as_at: date | None = None) -> DecisionOut:
    """Decide a motor or home claim.

    `as_at` overrides today's date so the Code clock can be evaluated at a
    point in time. The eval harness relies on it; production should not pass it.
    """
    try:
        record = decide(to_claim(body), today=as_at)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    log.info("motor %s -> %s", body.claim_id, record.outcome.value)
    return to_decision(record)


@app.post(
    "/claims/health/decide",
    response_model=DecisionOut,
    responses={422: {"model": ErrorOut}},
    tags=["decisions"],
)
def decide_health_claim(body: HealthClaimIn, as_at: date | None = None) -> DecisionOut:
    """Decide a private health claim.

    A pre-existing condition signal always escalates. Only a medical
    practitioner appointed by the insurer may resolve it, by setting
    `practitioner_assessed_pec`.
    """
    try:
        record = decide_health(
            claim_id=body.claim_id,
            membership=to_membership(body),
            service=to_service(body),
            date_of_service=body.date_of_service,
            date_notified=body.date_notified,
            vulnerability_signals=list(body.vulnerability_signals),
            today=as_at,
        )
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    log.info("health %s -> %s", body.claim_id, record.outcome.value)
    return to_decision(record)
