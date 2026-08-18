"""Health claim decision engine.

Same contract as the motor engine: no model calls, seven gates, five outcomes,
a reasons record you can put in front of the ombudsman.

The gates differ because the questions differ. Motor asks "was this peril
covered". Health asks "had you served your waiting period, and does your tier
include this clinical category".

One rule shapes the whole file: a pre-existing condition is assessed by a
medical practitioner appointed by the insurer, not by software. So a PEC
signal always produces ESCALATE and never DECLINE. Getting that wrong is not a
bug, it is a breach.
"""

from __future__ import annotations

from datetime import date, timedelta

from .clock import clock_status
from .health import (
    RESTRICTED_AT_BASIC,
    HealthService,
    Membership,
    Tier,
    categories_for,
    looks_pre_existing,
    waiting_period_days,
)
from .schemas import Gate, Outcome, ReasonsRecord

AUTO_SETTLE_CEILING = 15000.0   # hospital benefits run higher than motor repairs


def _pretty(category: str) -> str:
    return category.replace("_", " ")


def _membership_active(m: Membership, day: date) -> Gate:
    ok = m.active_on(day)
    if m.suspended_from and m.suspended_to and m.suspended_from <= day <= m.suspended_to:
        basis = f"Membership was suspended {m.suspended_from} to {m.suspended_to}."
    elif day < m.joined:
        basis = f"Service dated {day}, cover began {m.joined}."
    else:
        basis = f"Continuous cover since {m.joined}."
    return Gate(
        n=1, name="Membership active on the day of service", passed=ok,
        basis=basis, citation=f"{m.fund} · {m.member_number}",
    )


def _tier_covers(m: Membership, s: HealthService) -> Gate:
    if s.service_type == "extras":
        return Gate(
            n=2, name="Service within the product", passed=True,
            basis="Extras service, assessed against annual limits rather than clinical category.",
        )
    covered = categories_for(m.tier)
    ok = s.clinical_category in covered
    restricted = m.tier is Tier.BASIC and s.clinical_category in RESTRICTED_AT_BASIC
    if not ok:
        basis = (
            f"{m.tier.value.title()} does not include {_pretty(s.clinical_category)}. "
            f"That category starts at a higher tier."
        )
    elif restricted:
        basis = (
            f"{_pretty(s.clinical_category).capitalize()} is restricted on Basic. "
            "Benefits are limited to the public hospital rate, so a private admission "
            "leaves a substantial gap."
        )
    else:
        basis = f"{m.tier.value.title()} includes {_pretty(s.clinical_category)}."
    return Gate(
        n=2, name="Tier covers the clinical category", passed=ok,
        basis=basis, citation=f"Clinical category · {s.clinical_category}",
    )


def _waiting_period(m: Membership, s: HealthService, day: date) -> tuple[Gate, bool | None]:
    pec = looks_pre_existing(s, m.joined)
    required = waiting_period_days(s.clinical_category, pec)
    served = m.days_held(day)
    ok = served >= required
    clears_on = m.joined + timedelta(days=required)

    if pec and not ok:
        label = "pre-existing condition"
    elif s.clinical_category in {"pregnancy_and_birth", "assisted_reproductive_services"}:
        label = "pregnancy"
    else:
        label = "general"

    basis = (
        f"{served} days of cover against a {required} day {label} waiting period."
        if ok
        else f"{served} days of cover, {label} waiting period is {required} days. Clears {clears_on}."
    )
    return (
        Gate(n=3, name="Waiting period served", passed=ok, basis=basis,
             citation="Private Health Insurance Act, waiting periods"),
        pec,
    )


def _pec_assessment(s: HealthService, pec: bool | None) -> Gate:
    if s.service_type == "extras":
        return Gate(
            n=4, name="Pre-existing condition assessed", passed=True,
            basis="Not applicable. The pre-existing condition rule governs hospital cover.",
        )
    if s.practitioner_assessed_pec is not None:
        return Gate(
            n=4, name="Pre-existing condition assessed", passed=True,
            basis=("An appointed medical practitioner assessed this as pre-existing."
                   if s.practitioner_assessed_pec
                   else "An appointed medical practitioner assessed this as not pre-existing."),
            citation="PEC assessment on file",
        )
    if pec is None:
        return Gate(
            n=4, name="Pre-existing condition assessed", passed=False,
            basis="No symptom history on file, so the six month lookback cannot be applied.",
        )
    if pec:
        return Gate(
            n=4, name="Pre-existing condition assessed", passed=False,
            basis=("Symptoms fall inside the six month lookback before joining. "
                   "Only a medical practitioner appointed by the insurer can determine this."),
            citation="Private Health Insurance Act, pre-existing condition rule",
        )
    return Gate(
        n=4, name="Pre-existing condition assessed", passed=True,
        basis="Symptoms fall outside the six month lookback.",
    )


def _provider(s: HealthService) -> Gate:
    if s.service_type == "extras":
        ok = bool(s.provider_id)
        return Gate(n=5, name="Provider recognised", passed=ok,
                    basis="Recognised provider." if ok else "No provider number supplied.")
    return Gate(
        n=5, name="Hospital agreement in place", passed=s.provider_has_agreement,
        basis=("Agreement hospital, benefits paid at the contracted rate."
               if s.provider_has_agreement
               else "No agreement with this hospital. Benefits fall to the minimum rate and "
                    "the member carries a materially larger gap than they expect."),
        blocking=False,
    )


def _limit(m: Membership, s: HealthService) -> Gate:
    if s.service_type != "extras":
        amount = s.fund_benefit_scheduled
        return Gate(
            n=6, name="Benefit within auto-settle ceiling", passed=amount <= AUTO_SETTLE_CEILING,
            basis=f"{amount:,.2f} against a {AUTO_SETTLE_CEILING:,.0f} ceiling.",
            blocking=False,
        )
    remaining = m.extras_remaining(s.clinical_category)
    ok = s.fund_benefit_scheduled <= remaining
    return Gate(
        n=6, name="Annual limit not exhausted", passed=ok,
        basis=(f"{remaining:,.2f} remaining on {_pretty(s.clinical_category)}."
               if ok
               else f"Claim of {s.fund_benefit_scheduled:,.2f} exceeds {remaining:,.2f} remaining."),
        citation=f"Extras limit · {s.clinical_category}",
    )


def _vulnerability(signals: list[str]) -> Gate:
    return Gate(
        n=7, name="No vulnerability signals", passed=not signals,
        basis="None detected." if not signals else "Detected: " + ", ".join(signals),
        blocking=False,
    )


def decide_health(
    claim_id: str,
    membership: Membership,
    service: HealthService,
    date_of_service: date,
    date_notified: date,
    vulnerability_signals: list[str] | None = None,
    today: date | None = None,
) -> ReasonsRecord:
    today = today or date.today()
    signals = vulnerability_signals or []

    g1 = _membership_active(membership, date_of_service)
    g2 = _tier_covers(membership, service)
    g3, pec = _waiting_period(membership, service, date_of_service)
    g4 = _pec_assessment(service, pec)
    g5 = _provider(service)
    g6 = _limit(membership, service)
    g7 = _vulnerability(signals)
    gates = [g1, g2, g3, g4, g5, g6, g7]

    clock = clock_status(date_notified, today)
    escalation: list[str] = []
    missing: list[str] = []

    if not g1.passed:
        outcome = Outcome.DECLINE
    elif not g2.passed:
        outcome = Outcome.DECLINE
    elif pec is None and not g4.passed:
        outcome = Outcome.REQUEST_EVIDENCE
        missing.append("symptom history or a practitioner PEC assessment")
    elif pec and not g4.passed:
        # Never decline on a PEC signal. A practitioner decides, not this code.
        outcome = Outcome.ESCALATE
        escalation.append(
            "Possible pre-existing condition. Refer to the insurer's appointed medical "
            "practitioner. The engine does not make this call."
        )
    elif not g3.passed:
        outcome = Outcome.DECLINE
    elif not g6.passed and service.service_type == "extras":
        outcome = Outcome.PARTIAL
    elif not g7.passed:
        outcome = Outcome.ESCALATE
        escalation.append("Vulnerability signals detected. Route to a specialist handler.")
    elif not g5.passed:
        outcome = Outcome.ESCALATE
        escalation.append(
            "No hospital agreement. Confirm the member has had informed financial consent "
            "before benefits are paid."
        )
    elif not g6.passed:
        outcome = Outcome.ESCALATE
        escalation.append(g6.basis)
    else:
        outcome = Outcome.ACCEPT

    payable = None
    excess = None
    if outcome is Outcome.ACCEPT:
        excess = membership.hospital_excess if service.service_type == "hospital" else 0.0
        payable = max(0.0, round(service.fund_benefit_scheduled - excess, 2))
    elif outcome is Outcome.PARTIAL:
        excess = 0.0
        payable = max(0.0, round(membership.extras_remaining(service.clinical_category), 2))

    return ReasonsRecord(
        claim_id=claim_id,
        outcome=outcome,
        gates=gates,
        payable=payable,
        excess_applied=excess,
        missing_evidence=missing,
        escalation_reasons=escalation,
        clauses_relied_on=[g.citation for g in gates if g.citation],
        clock=clock,
    )
