"""Translate the wire contract into engine dataclasses, and back.

The only module that knows about both. Keeping it in one place means the
published API can stay stable while the engine's internals move, and a
breaking change is visible as a diff here rather than leaking silently.
"""

from __future__ import annotations

from verdict.health import HealthService, Membership, Tier
from verdict.schemas import (
    Claim,
    DamageFinding,
    EvidenceItem,
    IntegrityFlag,
    Policy,
    PolicyClause,
    ReasonsRecord,
    Severity,
)

from .models import DecisionOut, GateOut, HealthClaimIn, MotorClaimIn

ENGINE_VERSION = "0.7.0"


def to_claim(body: MotorClaimIn) -> Claim:
    p = body.policy
    return Claim(
        claim_id=body.claim_id,
        policy=Policy(
            policy_number=p.policy_number,
            product=p.product,
            pds_version=p.pds_version,
            effective_from=p.effective_from,
            effective_to=p.effective_to,
            inception=p.inception,
            excess=p.excess,
        ),
        date_of_loss=body.date_of_loss,
        date_notified=body.date_notified,
        peril=body.peril,
        narrative=body.narrative,
        clauses=[
            PolicyClause(c.clause_id, c.heading or c.clause_id, c.text, c.kind)
            for c in body.clauses
        ],
        damage=[
            DamageFinding(d.part, Severity(d.severity), d.confidence, d.source_image)
            for d in body.damage
        ],
        integrity=[IntegrityFlag(f.code, f.detail, f.weight) for f in body.integrity],
        evidence=[EvidenceItem(k, True) for k in body.evidence_present],
        quote_total=body.quote_total,
        estimate_low=body.estimate_low,
        estimate_high=body.estimate_high,
        vulnerability_signals=list(body.vulnerability_signals),
        all_info_received_on=body.all_info_received_on,
    )


def to_membership(body: HealthClaimIn) -> Membership:
    m = body.membership
    return Membership(
        member_number=m.member_number,
        fund=m.fund,
        tier=Tier(m.tier),
        joined=m.joined,
        product_started=m.product_started,
        hospital_excess=m.hospital_excess,
        extras_limits=dict(m.extras_limits),
        extras_used=dict(m.extras_used),
        suspended_from=m.suspended_from,
        suspended_to=m.suspended_to,
    )


def to_service(body: HealthClaimIn) -> HealthService:
    s = body.service
    return HealthService(
        service_type=s.service_type,
        clinical_category=s.clinical_category,
        mbs_items=list(s.mbs_items),
        provider_id=s.provider_id,
        provider_has_agreement=s.provider_has_agreement,
        charged=s.charged,
        medicare_benefit=s.medicare_benefit,
        fund_benefit_scheduled=s.fund_benefit_scheduled,
        symptoms_first_noted=s.symptoms_first_noted,
        practitioner_assessed_pec=s.practitioner_assessed_pec,
    )


def to_decision(record: ReasonsRecord) -> DecisionOut:
    return DecisionOut(
        claim_id=record.claim_id,
        outcome=record.outcome.value,
        summary=record.summary(),
        gates=[
            GateOut(n=g.n, name=g.name, passed=g.passed, basis=g.basis, citation=g.citation)
            for g in record.gates
        ],
        payable=record.payable,
        excess_applied=record.excess_applied,
        missing_evidence=list(record.missing_evidence),
        escalation_reasons=list(record.escalation_reasons),
        clauses_relied_on=list(record.clauses_relied_on),
        clock=record.clock,
        engine_version=ENGINE_VERSION,
    )
