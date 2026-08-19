from datetime import date

from verdict.health import HealthService, Membership, Tier, categories_for
from verdict.health_engine import decide_health
from verdict.schemas import Outcome

TODAY = date(2026, 8, 18)


def member(**kw):
    base = dict(
        member_number="HM-40218",
        fund="Southern Health",
        tier=Tier.SILVER,
        joined=date(2023, 1, 10),
        product_started=date(2023, 1, 10),
        hospital_excess=500.0,
        extras_limits={"dental": 1200.0, "optical": 350.0},
        extras_used={"dental": 300.0, "optical": 0.0},
    )
    base.update(kw)
    return Membership(**base)


def service(**kw):
    base = dict(
        service_type="hospital",
        clinical_category="heart_and_vascular",
        mbs_items=["38456"],
        provider_id="H0912",
        provider_has_agreement=True,
        charged=9800.0,
        medicare_benefit=2100.0,
        fund_benefit_scheduled=6900.0,
        symptoms_first_noted=date(2025, 11, 2),
    )
    base.update(kw)
    return HealthService(**base)


def run(m=None, s=None, dos=date(2026, 7, 20), **kw):
    return decide_health("H-001", m or member(), s or service(), dos, dos, today=TODAY, **kw)


# --- tier logic ---


def test_tiers_are_cumulative():
    assert "heart_and_vascular" in categories_for(Tier.GOLD)
    assert "digestive_system" in categories_for(Tier.SILVER)
    assert "joint_replacements" not in categories_for(Tier.SILVER)


def test_clean_hospital_claim_accepts():
    r = run()
    assert r.outcome is Outcome.ACCEPT
    assert r.payable == 6400.0  # 6900 benefit less 500 excess
    assert r.excess_applied == 500.0


def test_category_above_tier_declines():
    r = run(s=service(clinical_category="joint_replacements"))
    assert r.outcome is Outcome.DECLINE
    assert "higher tier" in r.gates[1].basis


def test_gold_covers_joint_replacement():
    assert (
        run(m=member(tier=Tier.GOLD), s=service(clinical_category="joint_replacements")).outcome
        is Outcome.ACCEPT
    )


# --- waiting periods ---


def test_general_wait_not_served_declines():
    r = run(m=member(joined=date(2026, 7, 1)), s=service(symptoms_first_noted=date(2026, 7, 15)))
    assert r.outcome is Outcome.DECLINE


def test_pregnancy_needs_twelve_months():
    m = member(tier=Tier.GOLD, joined=date(2026, 1, 5))
    s = service(clinical_category="pregnancy_and_birth", symptoms_first_noted=date(2026, 6, 1))
    assert run(m=m, s=s).outcome is Outcome.DECLINE


# --- the rule that matters ---


def test_pec_signal_escalates_never_declines():
    """A practitioner decides this, not the engine. Declining here is a breach."""
    m = member(joined=date(2026, 3, 1))
    s = service(symptoms_first_noted=date(2026, 2, 10))  # inside the 6mo lookback
    r = run(m=m, s=s)
    assert r.outcome is Outcome.ESCALATE
    assert r.outcome is not Outcome.DECLINE
    assert "appointed medical practitioner" in " ".join(r.escalation_reasons)


def test_practitioner_clearing_pec_allows_accept():
    m = member(joined=date(2026, 3, 1))
    s = service(symptoms_first_noted=date(2026, 2, 10), practitioner_assessed_pec=False)
    assert run(m=m, s=s).outcome is Outcome.ACCEPT


def test_missing_symptom_history_requests_evidence():
    r = run(m=member(joined=date(2026, 3, 1)), s=service(symptoms_first_noted=None))
    assert r.outcome is Outcome.REQUEST_EVIDENCE
    assert r.missing_evidence


# --- membership state ---


def test_suspended_membership_declines():
    m = member(suspended_from=date(2026, 7, 1), suspended_to=date(2026, 8, 1))
    assert run(m=m).outcome is Outcome.DECLINE


def test_service_before_joining_declines():
    assert run(m=member(joined=date(2026, 8, 1))).outcome is Outcome.DECLINE


# --- extras ---


def test_extras_within_limit_accepts():
    s = HealthService(
        service_type="extras",
        clinical_category="dental",
        provider_id="D5521",
        charged=260.0,
        fund_benefit_scheduled=180.0,
    )
    r = run(s=s)
    assert r.outcome is Outcome.ACCEPT
    assert r.excess_applied == 0.0


def test_extras_over_limit_pays_partial():
    s = HealthService(
        service_type="extras",
        clinical_category="optical",
        provider_id="O1180",
        charged=700.0,
        fund_benefit_scheduled=520.0,
    )
    r = run(s=s)
    assert r.outcome is Outcome.PARTIAL
    assert r.payable == 350.0


# --- other paths ---


def test_no_hospital_agreement_escalates():
    assert run(s=service(provider_has_agreement=False)).outcome is Outcome.ESCALATE


def test_vulnerability_routes_to_a_person():
    assert run(vulnerability_signals=["financial hardship disclosed"]).outcome is Outcome.ESCALATE


def test_basic_restricted_category_warns_in_the_record():
    m = member(tier=Tier.BASIC, hospital_excess=0.0)
    s = service(clinical_category="rehabilitation", fund_benefit_scheduled=2200.0)
    r = run(m=m, s=s)
    assert "restricted" in r.gates[1].basis.lower()


def test_engine_is_deterministic():
    a, b = run(), run()
    assert [g.basis for g in a.gates] == [g.basis for g in b.gates]
