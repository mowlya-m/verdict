from datetime import date

from verdict.engine import decide
from verdict.integrity import run_all, integrity_score
from verdict.schemas import (
    Claim, DamageFinding, EvidenceItem, IntegrityFlag,
    Outcome, Policy, PolicyClause, Severity,
)

TODAY = date(2026, 8, 17)


def make_policy(**kw):
    base = dict(
        policy_number="MTR-88213", product="Comprehensive Motor",
        pds_version="2025.11", effective_from=date(2026, 1, 1),
        effective_to=date(2026, 12, 31), inception=date(2024, 1, 1),
        excess=750.0,
    )
    base.update(kw)
    return Policy(**base)


def make_claim(**kw):
    base = dict(
        claim_id="A10293", policy=make_policy(),
        date_of_loss=date(2026, 8, 4), date_notified=date(2026, 8, 5),
        peril="motor_collision", narrative="Rear-ended at an intersection.",
        clauses=[PolicyClause("7.2", "Collision damage", "...", "insuring")],
        damage=[DamageFinding("rear bumper", Severity.MODERATE, 0.91, "img1.jpg")],
        evidence=[EvidenceItem(k, True) for k in
                  ("claim_form", "damage_photos", "repair_quote", "licence")],
        quote_total=2530.0, estimate_low=2100.0, estimate_high=2900.0,
    )
    base.update(kw)
    return Claim(**base)


def test_clean_claim_auto_accepts():
    r = decide(make_claim(), TODAY)
    assert r.outcome is Outcome.ACCEPT
    assert r.payable == 1780.0
    assert r.excess_applied == 750.0


def test_exclusion_declines_with_citation():
    c = make_claim(clauses=[
        PolicyClause("7.2", "Collision damage", "...", "insuring"),
        PolicyClause("9.4", "Unlicensed driver", "...", "exclusion"),
    ])
    r = decide(c, TODAY)
    assert r.outcome is Outcome.DECLINE
    assert "9.4" in r.clauses_relied_on


def test_loss_outside_cover_declines():
    c = make_claim(date_of_loss=date(2025, 11, 2),
                   policy=make_policy(inception=date(2025, 1, 1)))
    assert decide(c, TODAY).outcome is Outcome.DECLINE


def test_missing_evidence_requests_rather_than_declines():
    c = make_claim(evidence=[EvidenceItem("claim_form", True),
                             EvidenceItem("damage_photos", True)])
    r = decide(c, TODAY)
    assert r.outcome is Outcome.REQUEST_EVIDENCE
    assert set(r.missing_evidence) == {"repair_quote", "licence"}


def test_integrity_flags_escalate_not_decline():
    c = make_claim(integrity=[
        IntegrityFlag("PHOTO_PREDATES_LOSS", "Captured before the loss.", 3)])
    r = decide(c, TODAY)
    assert r.outcome is Outcome.ESCALATE


def test_high_value_escalates_even_when_clean():
    c = make_claim(quote_total=8400.0, estimate_high=8900.0)
    assert decide(c, TODAY).outcome is Outcome.ESCALATE


def test_vulnerability_routes_to_human():
    c = make_claim(vulnerability_signals=["financial hardship disclosed"])
    assert decide(c, TODAY).outcome is Outcome.ESCALATE


def test_undeterminable_damage_does_not_auto_pay():
    c = make_claim(quote_total=None, estimate_high=None,
                   damage=[DamageFinding("chassis", Severity.UNDETERMINABLE, 0.3, "i.jpg")])
    assert decide(c, TODAY).outcome is Outcome.ESCALATE


def test_loss_before_inception_is_serious():
    c = make_claim(date_of_loss=date(2026, 2, 1),
                   policy=make_policy(inception=date(2026, 3, 1)))
    flags = run_all(c)
    assert any(f.code == "LOSS_BEFORE_INCEPTION" for f in flags)
    assert integrity_score(flags) >= 3


def test_duplicate_images_detected():
    c = make_claim()
    flags = run_all(c, image_hashes={"a.jpg": "ff01", "b.jpg": "ff01", "c.jpg": "9a22"})
    assert any(f.code == "DUPLICATE_IMAGE" for f in flags)


def test_quote_above_band_flagged():
    c = make_claim(quote_total=5200.0, estimate_high=2900.0)
    flags = run_all(c)
    assert any(f.code == "QUOTE_ABOVE_BAND" for f in flags)


def test_clock_reports_position():
    r = decide(make_claim(), TODAY)
    assert r.clock["band"] == "ok"
    assert r.clock["days_remaining"] > 0


def test_clock_detects_breach():
    c = make_claim(date_notified=date(2026, 1, 5))
    r = decide(c, TODAY)
    assert r.clock["breached"] is True


def test_engine_is_deterministic():
    c = make_claim()
    assert [g.basis for g in decide(c, TODAY).gates] == [g.basis for g in decide(c, TODAY).gates]
