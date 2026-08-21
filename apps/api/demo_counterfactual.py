"""Show what would have to be different for four claims to come out otherwise.

    PYTHONPATH=src python3 demo_counterfactual.py

No network, no model, no API key. Every figure below is the engine re-run with
one fact changed, which is why the money is exact rather than estimated.
"""

from __future__ import annotations

from datetime import date

from verdict.counterfactual import explore
from verdict.schemas import (
    Claim,
    DamageFinding,
    EvidenceItem,
    IntegrityFlag,
    Policy,
    PolicyClause,
    Severity,
)

TODAY = date(2026, 8, 17)

POLICY = Policy(
    policy_number="MTR-88213",
    product="Comprehensive Motor",
    pds_version="2025.11",
    effective_from=date(2026, 1, 1),
    effective_to=date(2026, 12, 31),
    inception=date(2024, 1, 1),
    excess=750.0,
)

FULL_EVIDENCE = ("claim_form", "damage_photos", "repair_quote", "licence")


def show(title: str, claim: Claim) -> None:
    cf = explore(claim, TODAY)
    print(f"\n{'─' * 74}")
    print(f"{title}")
    print(f"  now: {cf.current.value.upper()}   settled: {cf.is_settled}")
    print(f"  {cf.summary()}\n")
    for lever in cf.levers:
        money = f"  +${lever.payable_delta:,.0f}" if lever.payable_delta else ""
        tag = "DECISIVE" if lever.decisive else ("progress" if lever.progresses else "immovable")
        print(f"    [{tag:9}] {lever.action}{money}")
        print(f"                 {lever.because}")


def base(**over: object) -> Claim:
    fields: dict[str, object] = {
        "claim_id": "A1",
        "policy": POLICY,
        "date_of_loss": date(2026, 8, 4),
        "date_notified": date(2026, 8, 5),
        "peril": "motor_collision",
        "narrative": "Rear-ended at the lights.",
        "clauses": [PolicyClause("7.2", "Collision damage", "", "insuring")],
        "damage": [DamageFinding("rear bumper", Severity.MODERATE, 0.9, "a.jpg")],
        "evidence": [EvidenceItem(k, True) for k in FULL_EVIDENCE],
        "quote_total": 2530.0,
        "estimate_high": 2900.0,
    }
    fields.update(over)
    return Claim(**fields)  # type: ignore[arg-type]


def main() -> None:
    show(
        "One document short",
        base(evidence=[EvidenceItem(k, True) for k in FULL_EVIDENCE[:3]]),
    )

    show(
        "Theft, three documents short",
        base(
            peril="motor_theft",
            clauses=[PolicyClause("8.1", "Theft of vehicle", "", "insuring")],
            evidence=[EvidenceItem("claim_form", True)],
        ),
    )

    # The claimant can do nothing here, and saying so plainly is the answer.
    show(
        "Exclusion applies",
        base(
            clauses=[
                PolicyClause("7.2", "Collision damage", "", "insuring"),
                PolicyClause("9.4", "Driver not licensed to drive the vehicle", "", "exclusion"),
            ]
        ),
    )

    # A discrepancy is not an accusation. Often there is an innocent
    # explanation and the claimant is the only one who holds it.
    show(
        "Photo predates the loss",
        base(
            integrity=[
                IntegrityFlag(
                    "PHOTO_PREDATES_LOSS",
                    "p1.jpg was captured on 12 Jul, before the stated loss date.",
                    3,
                )
            ]
        ),
    )
    print()


if __name__ == "__main__":
    main()
