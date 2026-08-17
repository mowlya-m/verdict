"""The decision engine.

NO MODEL CALLS IN THIS FILE. That is the whole point. Agents supply evidence,
this supplies the verdict, and the verdict is reproducible, inspectable and
identical on every run.

Five outcomes, not two. ACCEPT, PARTIAL and DECLINE carry different legal
consequences and collapsing them into "auto process" destroys the reasons
record. REQUEST_EVIDENCE is what stops the file going stale, which is the
single largest driver of claims-handling complaints in Australia.
"""

from __future__ import annotations

from datetime import date

from .clock import clock_status
from .integrity import integrity_score
from .schemas import Claim, Gate, Outcome, ReasonsRecord, Severity

REQUIRED_EVIDENCE = {
    "motor_collision": ["claim_form", "damage_photos", "repair_quote", "licence"],
    "motor_theft": ["claim_form", "police_report", "purchase_proof", "licence"],
    "motor_weather": ["claim_form", "damage_photos", "repair_quote"],
    "home_weather": ["claim_form", "damage_photos", "repair_quote"],
}

AUTO_SETTLE_CEILING = 5000.0
INTEGRITY_ESCALATE_AT = 3
INTEGRITY_DECLINE_AT = 6


def _policy_in_force(claim: Claim) -> Gate:
    ok = claim.policy.effective_from <= claim.date_of_loss <= claim.policy.effective_to
    return Gate(
        n=1,
        name="Policy in force at date of loss",
        passed=ok,
        basis=(
            f"Cover ran {claim.policy.effective_from} to {claim.policy.effective_to}; "
            f"loss dated {claim.date_of_loss}."
        ),
        citation=f"Policy {claim.policy.policy_number}, PDS {claim.policy.pds_version}",
    )


def _insuring_clause(claim: Claim) -> Gate:
    insuring = [c for c in claim.clauses if c.kind == "insuring"]
    return Gate(
        n=2,
        name="Peril falls within an insuring clause",
        passed=bool(insuring),
        basis=(
            f"{claim.peril} matched to {insuring[0].heading}."
            if insuring
            else f"No insuring clause retrieved for peril '{claim.peril}'."
        ),
        citation=insuring[0].clause_id if insuring else None,
    )


def _exclusions(claim: Claim) -> Gate:
    hits = [c for c in claim.clauses if c.kind == "exclusion"]
    return Gate(
        n=3,
        name="No exclusion applies",
        passed=not hits,
        basis=(
            f"Excluded by {hits[0].heading}."
            if hits
            else "No exclusion matched the circumstances."
        ),
        citation=hits[0].clause_id if hits else None,
    )


def _evidence(claim: Claim) -> tuple[Gate, list[str]]:
    required = REQUIRED_EVIDENCE.get(claim.peril, ["claim_form"])
    present = {e.kind for e in claim.evidence if e.present}
    missing = [r for r in required if r not in present]
    return (
        Gate(
            n=4,
            name="Evidence sufficient to decide",
            passed=not missing,
            basis=(
                "All required evidence on file."
                if not missing
                else "Missing: " + ", ".join(missing)
            ),
        ),
        missing,
    )


def _integrity(claim: Claim) -> Gate:
    score = integrity_score(claim.integrity)
    serious = [f for f in claim.integrity if f.weight >= 3]
    return Gate(
        n=5,
        name="Integrity checks",
        passed=score < INTEGRITY_ESCALATE_AT,
        basis=(
            "No material discrepancies."
            if not claim.integrity
            else f"Score {score}. " + " ".join(f.detail for f in claim.integrity)
        ),
        blocking=bool(serious),
    )


def _quantum(claim: Claim) -> Gate:
    amount = claim.quote_total or claim.estimate_high or 0.0
    determinable = any(d.severity is not Severity.UNDETERMINABLE for d in claim.damage) or bool(claim.quote_total)
    return Gate(
        n=6,
        name="Quantum within auto-settle ceiling",
        passed=determinable and amount <= AUTO_SETTLE_CEILING,
        basis=(
            f"{amount:,.2f} against a {AUTO_SETTLE_CEILING:,.0f} ceiling."
            if determinable
            else "Damage extent not determinable from the evidence supplied."
        ),
        blocking=False,
    )


def _vulnerability(claim: Claim) -> Gate:
    return Gate(
        n=7,
        name="No vulnerability signals",
        passed=not claim.vulnerability_signals,
        basis=(
            "None detected."
            if not claim.vulnerability_signals
            else "Detected: " + ", ".join(claim.vulnerability_signals)
        ),
        blocking=False,
    )


def decide(claim: Claim, today: date | None = None) -> ReasonsRecord:
    today = today or date.today()

    g1 = _policy_in_force(claim)
    g2 = _insuring_clause(claim)
    g3 = _exclusions(claim)
    g4, missing = _evidence(claim)
    g5 = _integrity(claim)
    g6 = _quantum(claim)
    g7 = _vulnerability(claim)
    gates = [g1, g2, g3, g4, g5, g6, g7]

    clock = clock_status(claim.date_notified, today, claim.all_info_received_on)

    outcome: Outcome
    escalation: list[str] = []

    # Hard declines first. These are coverage facts, not judgement calls.
    if not g1.passed:
        outcome = Outcome.DECLINE
    elif not g2.passed:
        outcome = Outcome.DECLINE
    elif not g3.passed:
        outcome = Outcome.DECLINE
    elif integrity_score(claim.integrity) >= INTEGRITY_DECLINE_AT:
        outcome = Outcome.ESCALATE
        escalation.append("Integrity score at investigation threshold. A human must decide, not the engine.")
    elif not g4.passed:
        outcome = Outcome.REQUEST_EVIDENCE
    elif not g5.passed:
        outcome = Outcome.ESCALATE
        escalation.append("Integrity discrepancies require review before payment.")
    elif not g7.passed:
        outcome = Outcome.ESCALATE
        escalation.append("Vulnerability signals detected. Route to a specialist handler.")
    elif not g6.passed:
        outcome = Outcome.ESCALATE
        escalation.append(g6.basis)
    else:
        outcome = Outcome.ACCEPT

    if clock["band"] == "breached" and outcome is not Outcome.ACCEPT:
        escalation.append("Code decision window already breached. Prioritise.")

    payable = None
    excess = None
    if outcome is Outcome.ACCEPT:
        gross = claim.quote_total or claim.estimate_high or 0.0
        excess = claim.policy.excess
        payable = max(0.0, round(gross - excess, 2))

    return ReasonsRecord(
        claim_id=claim.claim_id,
        outcome=outcome,
        gates=gates,
        payable=payable,
        excess_applied=excess,
        missing_evidence=missing,
        escalation_reasons=escalation,
        clauses_relied_on=[c.clause_id for c in claim.clauses],
        clock=clock,
    )
