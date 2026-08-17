"""Run sample claims through the engine and print the reasons records.

    python3 demo.py

No network, no model, no API key. This is the whole decision core end to end.
"""

from __future__ import annotations

from datetime import date

from verdict.engine import decide
from verdict.integrity import run_all
from verdict.schemas import (
    Claim,
    DamageFinding,
    EvidenceItem,
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

GREEN, RED, AMBER, DIM, OFF = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


def show(claim: Claim) -> None:
    r = decide(claim, TODAY)
    tone = {"accept": GREEN, "decline": RED}.get(r.outcome.value, AMBER)
    print(f"\n{'─' * 74}")
    print(
        f"{claim.claim_id}  {tone}{r.outcome.value.upper()}{OFF}"
        f"   {DIM}clock: {r.clock['band']}, {r.clock['days_remaining']}d remaining{OFF}"
    )
    print()
    for g in r.gates:
        mark = f"{GREEN}PASS{OFF}" if g.passed else f"{RED}FAIL{OFF}"
        cite = f"{DIM}{g.citation}{OFF}" if g.citation else ""
        print(f"  {mark}  {g.n}. {g.name:<40} {cite}")
    print(f"\n  {r.summary()}")


def main() -> None:
    clean = Claim(
        claim_id="A10293",
        policy=POLICY,
        date_of_loss=date(2026, 8, 4),
        date_notified=date(2026, 8, 5),
        peril="motor_collision",
        narrative="Rear-ended at an intersection.",
        clauses=[PolicyClause("7.2", "Collision damage", "...", "insuring")],
        damage=[DamageFinding("rear bumper", Severity.MODERATE, 0.91, "img1.jpg")],
        evidence=[
            EvidenceItem(k, True)
            for k in ("claim_form", "damage_photos", "repair_quote", "licence")
        ],
        quote_total=2530.0,
        estimate_low=2100.0,
        estimate_high=2900.0,
    )
    show(clean)

    dodgy = Claim(
        claim_id="A10294",
        policy=POLICY,
        date_of_loss=date(2026, 8, 1),
        date_notified=date(2026, 8, 2),
        peril="motor_collision",
        narrative="Hit a pole in a car park.",
        clauses=[PolicyClause("7.2", "Collision damage", "...", "insuring")],
        damage=[DamageFinding("front bumper", Severity.LIGHT, 0.88, "p1.jpg")],
        evidence=[
            EvidenceItem(k, True)
            for k in ("claim_form", "damage_photos", "repair_quote", "licence")
        ],
        quote_total=4900.0,
        estimate_low=900.0,
        estimate_high=1400.0,
    )
    dodgy.integrity = run_all(
        dodgy,
        exif_dates={"p1.jpg": date(2026, 7, 12)},
        image_hashes={"p1.jpg": "ff01", "p2.jpg": "ff01"},
        quoted_parts=["front bumper", "tailgate"],
    )
    show(dodgy)

    incomplete = Claim(
        claim_id="A10295",
        policy=POLICY,
        date_of_loss=date(2026, 8, 10),
        date_notified=date(2026, 8, 11),
        peril="motor_theft",
        narrative="Vehicle stolen overnight.",
        clauses=[PolicyClause("8.1", "Theft of vehicle", "...", "insuring")],
        evidence=[EvidenceItem("claim_form", True)],
    )
    show(incomplete)

    excluded = Claim(
        claim_id="A10291",
        policy=POLICY,
        date_of_loss=date(2026, 5, 19),
        date_notified=date(2026, 5, 20),
        peril="motor_collision",
        narrative="Collision while driving on an expired licence.",
        clauses=[
            PolicyClause("7.2", "Collision damage", "...", "insuring"),
            PolicyClause("9.4", "Driver not licensed", "...", "exclusion"),
        ],
        damage=[DamageFinding("front quarter", Severity.LIGHT, 0.9, "e1.jpg")],
        evidence=[
            EvidenceItem(k, True)
            for k in ("claim_form", "damage_photos", "repair_quote", "licence")
        ],
        quote_total=1420.0,
        estimate_high=1600.0,
    )
    show(excluded)
    print()


if __name__ == "__main__":
    main()
