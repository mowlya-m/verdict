"""Turn a normalised determination case into a Claim the engine can decide.

This is the layer that does real work. Everything else in eval/ is plumbing.

Architecturally this is an AGENT, not the engine: it reads prose and emits
structured facts. It is allowed to use a model. It is not allowed to emit an
outcome. See ADR-0002.
"""

from __future__ import annotations

from datetime import date

from verdict.schemas import (
    Claim,
    DamageFinding,
    EvidenceItem,
    IntegrityFlag,
    Policy,
    PolicyClause,
    Severity,
)

from .schema import DeterminationCase


def _d(s: str) -> date:
    return date.fromisoformat(s)


def to_claim(case: DeterminationCase) -> Claim:
    policy = Policy(
        policy_number=f"AFCA-{case.case_id}",
        product=case.product,
        pds_version=f"asat-{case.date_of_loss}",
        effective_from=_d(case.policy_effective_from),
        effective_to=_d(case.policy_effective_to),
        inception=_d(case.policy_inception),
        excess=case.excess,
    )

    clauses = [
        PolicyClause(c, c, "", "insuring") for c in case.insuring_clauses
    ] + [
        PolicyClause(c, c, "", "exclusion") for c in case.exclusion_clauses
    ]

    damage = []
    if case.quote_total or case.estimate_high:
        damage = [DamageFinding("as assessed", Severity.MODERATE, 0.0, "determination")]

    return Claim(
        claim_id=case.case_id,
        policy=policy,
        date_of_loss=_d(case.date_of_loss),
        date_notified=_d(case.date_notified),
        peril=case.peril,
        narrative="",
        clauses=clauses,
        damage=damage,
        integrity=[IntegrityFlag(f["code"], f.get("detail", ""), int(f["weight"]))
                   for f in case.integrity_flags],
        evidence=[EvidenceItem(k, True) for k in case.evidence_present],
        quote_total=case.quote_total,
        estimate_high=case.estimate_high,
        vulnerability_signals=list(case.vulnerability_signals),
    )


EXTRACTION_PROMPT = """You are reading a published AFCA determination about a general
insurance claim. Extract only facts that are stated in the document. Do not infer
the outcome, and do not include AFCA's reasoning or conclusion.

Return JSON only, no prose, no markdown fences:

{
  "product": "motor|home|travel|other",
  "peril": "motor_collision|motor_theft|motor_weather|home_weather|other",
  "date_of_loss": "YYYY-MM-DD",
  "date_notified": "YYYY-MM-DD",
  "policy_effective_from": "YYYY-MM-DD",
  "policy_effective_to": "YYYY-MM-DD",
  "policy_inception": "YYYY-MM-DD",
  "excess": 0.0,
  "insuring_clauses": ["clause reference the insurer relied on to cover"],
  "exclusion_clauses": ["clause reference the insurer relied on to decline"],
  "evidence_present": ["claim_form","damage_photos","repair_quote","licence",
                       "police_report","purchase_proof"],
  "integrity_flags": [{"code":"","detail":"","weight":1}],
  "vulnerability_signals": ["financial hardship" etc, only if stated],
  "quote_total": null,
  "estimate_high": null
}

If a date is not stated, use the closest stated date and note it. If a field cannot
be determined, use null rather than guessing.

DETERMINATION TEXT:
---
{text}
---"""
