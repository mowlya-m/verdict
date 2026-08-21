"""Counterfactuals.

Two things are being tested. That the arithmetic is right, and that the module
will not coach anyone into misrepresenting a claim. The second matters more.
"""

from datetime import date

from verdict.counterfactual import FIXED_FACTS, Kind, explain_gate, explore
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


def policy(**kw):
    base = dict(
        policy_number="MTR-88213",
        product="Comprehensive Motor",
        pds_version="2025.11",
        effective_from=date(2026, 1, 1),
        effective_to=date(2026, 12, 31),
        inception=date(2024, 1, 1),
        excess=750.0,
    )
    base.update(kw)
    return Policy(**base)


def claim(**kw):
    base = dict(
        claim_id="A1",
        policy=policy(),
        date_of_loss=date(2026, 8, 4),
        date_notified=date(2026, 8, 5),
        peril="motor_collision",
        narrative="Rear-ended at the lights.",
        clauses=[PolicyClause("7.2", "Collision damage", "", "insuring")],
        damage=[DamageFinding("rear bumper", Severity.MODERATE, 0.9, "a.jpg")],
        evidence=[
            EvidenceItem(k, True)
            for k in ("claim_form", "damage_photos", "repair_quote", "licence")
        ],
        quote_total=2530.0,
        estimate_high=2900.0,
    )
    base.update(kw)
    return Claim(**base)


# --- the line that matters ---


def test_never_suggests_changing_what_happened():
    """A lever a claimant could only pull by lying is not a lever.

    The date of the loss, the peril, the damage. If this test ever fails, the
    product has started coaching misrepresentation.
    """
    c = claim(
        evidence=[EvidenceItem("claim_form", True)],
        integrity=[IntegrityFlag("PHOTO_PREDATES_LOSS", "Captured early.", 3)],
        clauses=[
            PolicyClause("7.2", "Collision damage", "", "insuring"),
            PolicyClause("9.4", "Driver not licensed", "", "exclusion"),
        ],
    )
    text = " ".join(f"{x.action} {x.because}".lower() for x in explore(c, TODAY).levers)
    for phrase in (
        "change the date",
        "say the",
        "state a different",
        "report a different",
        "amend the date",
        "revise what",
    ):
        assert phrase not in text


def test_an_exclusion_is_reported_as_immovable_not_offered():
    c = claim(
        clauses=[
            PolicyClause("7.2", "Collision damage", "", "insuring"),
            PolicyClause("9.4", "Driver not licensed", "", "exclusion"),
        ]
    )
    cf = explore(c, TODAY)
    exclusion = [x for x in cf.levers if x.kind is Kind.IMMOVABLE]
    assert exclusion
    assert exclusion[0].outcome is None  # never shown as achievable
    assert exclusion[0].payable_delta is None
    assert cf.is_settled


def test_fixed_facts_are_declared():
    assert "date_of_loss" in FIXED_FACTS
    assert "peril" in FIXED_FACTS
    assert "narrative" in FIXED_FACTS


# --- arithmetic ---


def test_accepted_claim_has_nothing_to_change():
    cf = explore(claim(), TODAY)
    assert cf.levers == []
    assert "Already payable" in cf.summary()


def test_missing_document_is_a_decisive_lever():
    c = claim(
        evidence=[EvidenceItem(k, True) for k in ("claim_form", "damage_photos", "repair_quote")]
    )
    cf = explore(c, TODAY)
    licence = [x for x in cf.levers if "licence" in x.action]
    assert licence
    assert licence[0].decisive
    assert licence[0].kind is Kind.CLAIMANT


def test_the_money_is_real_not_estimated():
    c = claim(
        evidence=[EvidenceItem(k, True) for k in ("claim_form", "damage_photos", "repair_quote")]
    )
    lever = explore(c, TODAY).decisive_levers[0]
    assert lever.payable_delta == 1780.0  # 2530 quote less 750 excess


def test_each_document_is_offered_separately():
    """'Send us four things' is a wall. One next step is a next step."""
    c = claim(peril="motor_theft", evidence=[EvidenceItem("claim_form", True)])
    actions = [x.action for x in explore(c, TODAY).levers]
    assert sum(1 for a in actions if a.startswith("Supply the")) >= 2
    assert any("all outstanding" in a for a in actions)


def test_integrity_flag_is_explainable_not_an_accusation():
    c = claim(integrity=[IntegrityFlag("PHOTO_PREDATES_LOSS", "Captured 12 Jul.", 3)])
    lever = explore(c, TODAY).decisive_levers[0]
    assert "Explain" in lever.action
    assert lever.kind is Kind.CLAIMANT
    assert "12 Jul" in lever.because


def test_vulnerability_is_the_insurer_s_job_not_the_claimant_s():
    """Never framed as something the person should withdraw."""
    c = claim(vulnerability_signals=["financial hardship disclosed"])
    lever = explore(c, TODAY).decisive_levers[0]
    assert lever.kind is Kind.INSURER
    assert "withdraw" not in lever.action.lower()


def test_cover_period_failure_is_immovable():
    c = claim(date_of_loss=date(2025, 11, 2), date_notified=date(2025, 11, 3))
    cf = explore(c, TODAY)
    assert cf.is_settled
    assert any(x.kind is Kind.IMMOVABLE for x in cf.levers)


def test_decisive_levers_come_first():
    c = claim(
        evidence=[EvidenceItem("claim_form", True)],
        clauses=[
            PolicyClause("7.2", "Collision damage", "", "insuring"),
            PolicyClause("9.4", "Driver not licensed", "", "exclusion"),
        ],
    )
    kinds = [x.kind for x in explore(c, TODAY).levers]
    if Kind.IMMOVABLE in kinds:
        assert kinds.index(Kind.IMMOVABLE) == len(kinds) - 1


def test_changes_that_change_nothing_are_not_reported():
    """An exclusion decides the claim, so supplying documents is noise."""
    c = claim(
        evidence=[EvidenceItem("claim_form", True)],
        clauses=[
            PolicyClause("7.2", "Collision damage", "", "insuring"),
            PolicyClause("9.4", "Driver not licensed", "", "exclusion"),
        ],
    )
    assert explore(c, TODAY).decisive_levers == []


# --- gate explanation ---


def test_explain_names_the_deciding_gate():
    c = claim(evidence=[EvidenceItem("claim_form", True)])
    text = explain_gate(c, 4, TODAY)
    assert "decides this claim" in text
    assert "1,780.00" in text


def test_explain_says_when_a_gate_is_not_decisive():
    c = claim(
        evidence=[EvidenceItem("claim_form", True)],
        clauses=[
            PolicyClause("7.2", "Collision damage", "", "insuring"),
            PolicyClause("9.4", "Driver not licensed", "", "exclusion"),
        ],
    )
    assert "not what decides" in explain_gate(c, 4, TODAY)


def test_explain_handles_a_passing_gate():
    assert "passed" in explain_gate(claim(), 1, TODAY)


def test_explain_handles_a_gate_that_does_not_exist():
    assert "no gate 99" in explain_gate(claim(), 99, TODAY)


# --- determinism ---


def test_exploring_twice_gives_the_same_answer():
    c = claim(evidence=[EvidenceItem("claim_form", True)])
    a, b = explore(c, TODAY), explore(c, TODAY)
    assert [x.action for x in a.levers] == [x.action for x in b.levers]
    assert [x.payable_delta for x in a.levers] == [x.payable_delta for x in b.levers]


def test_exploring_does_not_mutate_the_claim():
    c = claim(evidence=[EvidenceItem("claim_form", True)])
    before = len(c.evidence)
    explore(c, TODAY)
    assert len(c.evidence) == before
