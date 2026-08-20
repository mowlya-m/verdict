"""Intake agent.

Every test runs against a stubbed model. The point is never to check that the
model is clever; it is to check that whatever the model returns, the agent
cannot leak a verdict, cannot invent a date, and cannot half-succeed.
"""

from datetime import date

import httpx
import pytest

from verdict.agents.intake import (
    FORBIDDEN_KEYS,
    Extraction,
    IntakeError,
    _coerce,
    _reject_verdicts,
    _strip_fences,
    extract,
)

REF = date(2026, 8, 17)

GOOD = {
    "peril": "motor_collision",
    "date_of_loss": "2026-08-04",
    "time_of_day": "around 8:30am",
    "location": "Swan Street, Richmond",
    "summary": "The insured was stationary and was struck from behind.",
    "parties": ["the insured", "the driver of the other vehicle"],
    "damage": [
        {"part": "rear bumper", "severity": "moderate", "quote": "went into my rear bumper"}
    ],
    "injuries_reported": False,
    "police_involved": None,
    "third_party_details_exchanged": True,
    "vulnerability_signals": [],
    "missing": ["the other driver's registration"],
    "quotes": {"location": "on Swan Street"},
    "unresolved": [],
}


def stub(payload, status=200):
    """A client that returns whatever payload we hand it."""
    text = payload if isinstance(payload, str) else __import__("json").dumps(payload)

    def handler(request):
        return httpx.Response(status, json={"content": [{"type": "text", "text": text}]})

    return httpx.Client(transport=httpx.MockTransport(handler))


def run(payload, narrative="I was rear-ended on Swan Street.", status=200, ref=REF):
    return extract(narrative, reference_date=ref, api_key="test", client=stub(payload, status))


# --- the boundary. these are the tests that matter. ---


def test_intake_cannot_return_a_verdict():
    """ADR-0002. Intake reads; the engine decides.

    A model that adds `covered: true` must fail loudly rather than have the
    field silently dropped, because silence is the wrong answer to a breach.
    """
    for key in ("outcome", "covered", "payable", "confidence", "fraud", "recommendation"):
        with pytest.raises(IntakeError, match="decision-shaped"):
            run({**GOOD, key: "anything"})


def test_every_forbidden_key_is_caught():
    for key in FORBIDDEN_KEYS:
        with pytest.raises(IntakeError):
            _reject_verdicts({key: 1})


def test_output_schema_has_no_outcome_field():
    """Structural, not behavioural. There is nowhere to put a verdict."""
    fields = set(Extraction.__dataclass_fields__)
    assert not (fields & FORBIDDEN_KEYS)


# --- extraction ---


def test_reads_the_facts():
    e = run(GOOD)
    assert e.peril == "motor_collision"
    assert e.date_of_loss == date(2026, 8, 4)
    assert e.location == "Swan Street, Richmond"
    assert e.damage[0]["part"] == "rear bumper"
    assert e.third_party_details_exchanged is True


def test_missing_evidence_is_surfaced():
    e = run(GOOD)
    assert "the other driver's registration" in e.missing
    assert e.ready_to_decide is False


def test_ready_only_when_nothing_is_outstanding():
    assert run({**GOOD, "missing": []}).ready_to_decide is True


def test_quotes_trace_back_to_the_person_s_words():
    assert run(GOOD).quotes["location"] == "on Swan Street"


# --- refusing to guess ---


def test_future_date_is_discarded_rather_than_used():
    """A loss cannot postdate the claim. Null beats a value the engine acts on."""
    assert run({**GOOD, "date_of_loss": "2027-01-01"}).date_of_loss is None


def test_absurdly_old_date_is_discarded():
    assert run({**GOOD, "date_of_loss": "1990-01-01"}).date_of_loss is None


def test_unparseable_date_becomes_null():
    assert run({**GOOD, "date_of_loss": "last Tuesday"}).date_of_loss is None


def test_unknown_peril_falls_back_to_other():
    assert run({**GOOD, "peril": "alien_invasion"}).peril == "other"


def test_unknown_severity_becomes_undeterminable():
    e = run({**GOOD, "damage": [{"part": "door", "severity": "catastrophic"}]})
    assert e.damage[0]["severity"] == "undeterminable"


def test_damage_without_a_part_is_dropped():
    assert run({**GOOD, "damage": [{"severity": "light"}]}).damage == []


def test_non_boolean_tristate_becomes_null():
    assert run({**GOOD, "injuries_reported": "maybe"}).injuries_reported is None


# --- vulnerability ---


def test_vulnerability_signals_pass_through():
    e = run({**GOOD, "vulnerability_signals": ["said they cannot afford the excess this month"]})
    assert e.vulnerability_signals
    assert "excess" in e.vulnerability_signals[0]


# --- failure modes ---


def test_empty_narrative_is_refused():
    with pytest.raises(IntakeError, match="empty"):
        extract("   ", api_key="test", client=stub(GOOD))


def test_missing_api_key_is_refused(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(IntakeError, match="ANTHROPIC_API_KEY"):
        extract("something happened", client=stub(GOOD))


def test_upstream_error_is_refused():
    with pytest.raises(IntakeError, match="502"):
        run(GOOD, status=502)


def test_unparseable_json_is_refused():
    with pytest.raises(IntakeError, match="usable JSON"):
        run("this is not json")


def test_non_object_response_is_refused():
    with pytest.raises(IntakeError, match="other than an object"):
        run("[1, 2, 3]")


def test_unreachable_service_is_refused():
    def boom(request):
        raise httpx.ConnectError("no route")

    with pytest.raises(IntakeError, match="Could not reach"):
        extract(
            "something", api_key="test", client=httpx.Client(transport=httpx.MockTransport(boom))
        )


# --- tolerances ---


def test_fenced_json_is_accepted():
    """Models fence output despite instruction. Cheaper to handle than to fight."""
    import json

    assert run("```json\n" + json.dumps(GOOD) + "\n```").peril == "motor_collision"


def test_empty_payload_coerces_to_a_safe_extraction():
    e = _coerce({}, REF)
    assert e.peril == "other"
    assert e.date_of_loss is None
    assert e.ready_to_decide is False


def test_strip_fences_leaves_plain_json_alone():
    assert _strip_fences('{"a":1}') == '{"a":1}'
