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

from verdict.agents.intake import IntakeError, extract
from verdict.agents.vision_agent import assess_damage_from_image
from verdict.counterfactual import explain_gate, explore
from verdict.engine import decide
from verdict.health_engine import decide_health

from .mapping import (
    ENGINE_VERSION,
    to_claim,
    to_decision,
    to_membership,
    to_service,
)
from .models import (
    CounterfactualOut,
    DamageOut,
    DecisionOut,
    ErrorOut,
    HealthClaimIn,
    IntakeIn,
    IntakeOut,
    LeverOut,
    MotorClaimIn,
)

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


@app.post(
    "/intake/extract",
    response_model=IntakeOut,
    responses={422: {"model": ErrorOut}, 502: {"model": ErrorOut}},
    tags=["agents"],
)
def intake(body: IntakeIn) -> IntakeOut:
    """Read a claimant's own words and return structured facts.

    This endpoint cannot decide anything. `IntakeOut` has no field capable of
    expressing an outcome, and the agent raises if the model returns one anyway.
    Feed the result to `/claims/motor/decide` once the gaps in `missing` are
    filled.
    """
    try:
        e = extract(body.narrative, reference_date=body.reference_date)
    except IntakeError as exc:
        # 502 rather than 500: the failure is upstream, and the message is
        # written to be shown to a person rather than buried in a log.
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    log.info("intake peril=%s missing=%d", e.peril, len(e.missing))
    return IntakeOut(
        peril=e.peril,
        date_of_loss=e.date_of_loss,
        time_of_day=e.time_of_day,
        location=e.location,
        summary=e.summary,
        parties=e.parties,
        damage=[
            DamageOut(
                part=d["part"],
                severity=d["severity"],  # type: ignore[arg-type]
                quote=d.get("quote", ""),
            )
            for d in e.damage
        ],
        injuries_reported=e.injuries_reported,
        police_involved=e.police_involved,
        third_party_details_exchanged=e.third_party_details_exchanged,
        vulnerability_signals=e.vulnerability_signals,
        missing=e.missing,
        quotes=e.quotes,
        unresolved=e.unresolved,
        ready_to_decide=e.ready_to_decide,
    )


@app.post(
    "/claims/motor/counterfactual",
    response_model=CounterfactualOut,
    responses={422: {"model": ErrorOut}},
    tags=["decisions"],
)
def motor_counterfactual(body: MotorClaimIn, as_at: date | None = None) -> CounterfactualOut:
    """Report what would have to be different for this claim to come out otherwise.

    Each lever is the engine re-run with one fact changed, so the money is
    arithmetic rather than a guess. Facts a claimant could only change by
    misrepresenting the loss are never offered; where one is decisive it is
    reported as `immovable` with a null outcome.

    `is_settled` is the most useful field. True means stop chasing.
    """
    try:
        cf = explore(to_claim(body), today=as_at)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return CounterfactualOut(
        current=cf.current.value,
        summary=cf.summary(),
        is_settled=cf.is_settled,
        levers=[
            LeverOut(
                kind=x.kind.value,
                action=x.action,
                because=x.because,
                outcome=x.outcome.value if x.outcome else None,
                payable_delta=x.payable_delta,
                gate_cleared=x.gate_cleared,
                gaps_closed=x.gaps_closed,
                decisive=x.decisive,
                progresses=x.progresses,
            )
            for x in cf.levers
        ],
    )


@app.post("/claims/motor/explain/{gate}", response_model=dict[str, str], tags=["decisions"])
def motor_explain(gate: int, body: MotorClaimIn, as_at: date | None = None) -> dict[str, str]:
    """How much rests on one gate.

    Answers the assessor's real question, which is never what a gate checks but
    whether it is the thing deciding the claim.
    """
    return {"gate": str(gate), "explanation": explain_gate(to_claim(body), gate, today=as_at)}


@app.post(
    "/agents/vision/assess",
    response_model=DamageOut,
    responses={422: {"model": ErrorOut}, 502: {"model": ErrorOut}},
    tags=["agents"],
    summary="Vision Agent"
)
def assess_damage(body: IntakeIn) -> DamageOut:
    """Analyze a claim image for damage."""
    try:
        result = assess_damage_from_image(image_base64=body.narrative)
        return DamageOut(
            part=", ".join(result.damaged_parts),
            severity=result.severity_band,
            quote=result.notes,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
