import pytest
from fastapi.testclient import TestClient

from verdict.api.main import app

client = TestClient(app)
AS_AT = "2026-08-17"

MOTOR = {
    "claim_id": "A10293",
    "policy": {
        "policy_number": "MTR-88213",
        "product": "Comprehensive Motor",
        "pds_version": "2025.11",
        "effective_from": "2026-01-01",
        "effective_to": "2026-12-31",
        "inception": "2024-01-01",
        "excess": 750.0,
    },
    "date_of_loss": "2026-08-04",
    "date_notified": "2026-08-05",
    "peril": "motor_collision",
    "narrative": "Rear-ended at an intersection.",
    "clauses": [{"clause_id": "7.2", "heading": "Collision damage", "kind": "insuring"}],
    "damage": [{"part": "rear bumper", "severity": "moderate", "confidence": 0.91}],
    "evidence_present": ["claim_form", "damage_photos", "repair_quote", "licence"],
    "quote_total": 2530.0,
    "estimate_high": 2900.0,
}

HEALTH = {
    "claim_id": "H-1001",
    "membership": {
        "member_number": "HM-40218",
        "fund": "Southern Health",
        "tier": "silver",
        "joined": "2023-01-10",
        "product_started": "2023-01-10",
        "hospital_excess": 500.0,
        "extras_limits": {"optical": 350.0},
        "extras_used": {"optical": 0.0},
    },
    "service": {
        "service_type": "hospital",
        "clinical_category": "heart_and_vascular",
        "provider_id": "H0912",
        "provider_has_agreement": True,
        "charged": 9800.0,
        "medicare_benefit": 2100.0,
        "fund_benefit_scheduled": 6900.0,
        "symptoms_first_noted": "2025-11-02",
    },
    "date_of_service": "2026-07-20",
    "date_notified": "2026-07-20",
}


def post(path, body, as_at=AS_AT):
    return client.post(f"{path}?as_at={as_at}", json=body)


def merge(base, **over):
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in base.items()}
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = {**out[k], **v}
        else:
            out[k] = v
    return out


# --- meta ---


def test_healthcheck():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_openapi_schema_generates():
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert "/claims/motor/decide" in r.json()["paths"]


# --- motor ---


def test_motor_clean_claim_accepts():
    r = post("/claims/motor/decide", MOTOR)
    assert r.status_code == 200
    d = r.json()
    assert d["outcome"] == "accept"
    assert d["payable"] == 1780.0
    assert len(d["gates"]) == 7


def test_motor_exclusion_declines_and_cites_the_clause():
    body = merge(
        MOTOR,
        clauses=[
            {"clause_id": "7.2", "heading": "Collision damage", "kind": "insuring"},
            {"clause_id": "9.4", "heading": "Driver not licensed", "kind": "exclusion"},
        ],
    )
    d = post("/claims/motor/decide", body).json()
    assert d["outcome"] == "decline"
    assert "9.4" in d["clauses_relied_on"]


def test_motor_missing_evidence_requests_it():
    body = merge(MOTOR, evidence_present=["claim_form"])
    d = post("/claims/motor/decide", body).json()
    assert d["outcome"] == "request_evidence"
    assert d["missing_evidence"]


def test_motor_integrity_flag_escalates():
    body = merge(
        MOTOR,
        integrity=[
            {"code": "PHOTO_PREDATES_LOSS", "detail": "Captured before the loss.", "weight": 3}
        ],
    )
    assert post("/claims/motor/decide", body).json()["outcome"] == "escalate"


def test_response_carries_no_confidence_score():
    """ADR-0004. A percentage would not be calibrated against anything."""
    d = post("/claims/motor/decide", MOTOR).json()
    assert "confidence" not in d
    assert not any("confidence" in k for k in d)


def test_clock_is_returned():
    d = post("/claims/motor/decide", MOTOR).json()
    assert d["clock"]["band"] == "ok"
    assert d["clock"]["days_remaining"] > 0


def test_engine_version_is_reported():
    assert post("/claims/motor/decide", MOTOR).json()["engine_version"]


# --- health ---


def test_health_clean_claim_accepts():
    d = post("/claims/health/decide", HEALTH).json()
    assert d["outcome"] == "accept"
    assert d["payable"] == 6400.0


def test_health_tier_below_category_declines():
    body = merge(HEALTH, service={"clinical_category": "joint_replacements"})
    assert post("/claims/health/decide", body).json()["outcome"] == "decline"


def test_health_pec_signal_escalates_over_the_wire():
    """The rule must survive serialisation, not just hold inside the engine."""
    body = merge(
        HEALTH,
        membership={"joined": "2026-03-01", "product_started": "2026-03-01"},
        service={"symptoms_first_noted": "2026-02-10"},
    )
    d = post("/claims/health/decide", body).json()
    assert d["outcome"] == "escalate"
    assert d["outcome"] != "decline"
    assert "practitioner" in " ".join(d["escalation_reasons"]).lower()


def test_health_extras_over_limit_pays_partial():
    body = merge(
        HEALTH,
        service={
            "service_type": "extras",
            "clinical_category": "optical",
            "provider_id": "O1180",
            "charged": 700.0,
            "medicare_benefit": 0.0,
            "fund_benefit_scheduled": 520.0,
            "symptoms_first_noted": None,
        },
    )
    d = post("/claims/health/decide", body).json()
    assert d["outcome"] == "partial"
    assert d["payable"] == 350.0


# --- validation ---


def test_notification_before_loss_is_rejected():
    body = merge(MOTOR, date_notified="2026-08-01")
    assert post("/claims/motor/decide", body).status_code == 422


def test_cover_period_reversed_is_rejected():
    body = merge(MOTOR, policy={"effective_from": "2026-12-31", "effective_to": "2026-01-01"})
    assert post("/claims/motor/decide", body).status_code == 422


def test_unknown_severity_is_rejected():
    body = merge(MOTOR, damage=[{"part": "bumper", "severity": "catastrophic"}])
    assert post("/claims/motor/decide", body).status_code == 422


def test_integrity_weight_out_of_range_is_rejected():
    body = merge(MOTOR, integrity=[{"code": "X", "detail": "", "weight": 9}])
    assert post("/claims/motor/decide", body).status_code == 422


def test_api_is_deterministic():
    a = post("/claims/motor/decide", MOTOR).json()
    b = post("/claims/motor/decide", MOTOR).json()
    assert a == b


# --- deployment safety ---


def test_root_points_at_the_docs():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["docs"] == "/docs"


def test_wildcard_origin_is_refused():
    """A wildcard would let any site drive the engine from a visitor's browser."""
    import importlib
    import os

    import verdict.api.main as m

    old = os.environ.get("ALLOWED_ORIGINS")
    os.environ["ALLOWED_ORIGINS"] = "*"
    try:
        with pytest.raises(RuntimeError):
            importlib.reload(m)
    finally:
        if old is None:
            os.environ.pop("ALLOWED_ORIGINS", None)
        else:
            os.environ["ALLOWED_ORIGINS"] = old
        importlib.reload(m)


def test_configured_origins_are_used():
    import importlib
    import os

    import verdict.api.main as m

    os.environ["ALLOWED_ORIGINS"] = "https://a.example, https://b.example"
    try:
        importlib.reload(m)
        assert m.ALLOWED_ORIGINS == ["https://a.example", "https://b.example"]
    finally:
        os.environ.pop("ALLOWED_ORIGINS", None)
        importlib.reload(m)


# --- intake route ---


def test_intake_rejects_a_too_short_narrative():
    assert client.post("/intake/extract", json={"narrative": "hi"}).status_code == 422


def test_intake_surfaces_upstream_failure_as_502(monkeypatch):
    """A missing key is an operator problem, not a 500. Say so plainly."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    r = client.post(
        "/intake/extract",
        json={"narrative": "I was rear-ended at the lights on Swan Street yesterday."},
    )
    assert r.status_code == 502
    assert "ANTHROPIC_API_KEY" in r.json()["detail"]


def test_intake_response_schema_carries_no_outcome():
    """ADR-0002, enforced at the wire as well as in the agent."""
    schema = client.get("/openapi.json").json()["components"]["schemas"]["IntakeOut"]
    forbidden = {"outcome", "covered", "payable", "confidence", "decision", "verdict"}
    assert not (set(schema["properties"]) & forbidden)


# --- counterfactuals ---


def test_counterfactual_names_the_missing_document():
    body = merge(MOTOR, evidence_present=["claim_form", "damage_photos", "repair_quote"])
    d = post("/claims/motor/counterfactual", body).json()
    assert d["current"] == "request_evidence"
    assert d["is_settled"] is False
    assert any("licence" in x["action"] for x in d["levers"])


def test_counterfactual_reports_the_real_money():
    body = merge(MOTOR, evidence_present=["claim_form", "damage_photos", "repair_quote"])
    lever = post("/claims/motor/counterfactual", body).json()["levers"][0]
    assert lever["payable_delta"] == 1780.0
    assert lever["decisive"] is True


def test_counterfactual_marks_an_exclusion_as_settled():
    body = merge(
        MOTOR,
        clauses=[
            {"clause_id": "7.2", "heading": "Collision damage", "kind": "insuring"},
            {"clause_id": "9.4", "heading": "Driver not licensed", "kind": "exclusion"},
        ],
    )
    d = post("/claims/motor/counterfactual", body).json()
    assert d["is_settled"] is True
    immovable = [x for x in d["levers"] if x["kind"] == "immovable"]
    assert immovable
    assert immovable[0]["outcome"] is None


def test_counterfactual_on_an_accepted_claim_has_no_levers():
    d = post("/claims/motor/counterfactual", MOTOR).json()
    assert d["levers"] == []
    assert "Already payable" in d["summary"]


def test_explain_gate_over_the_wire():
    body = merge(MOTOR, evidence_present=["claim_form"])
    r = client.post(f"/claims/motor/explain/4?as_at={AS_AT}", json=body)
    assert r.status_code == 200
    assert "decides this claim" in r.json()["explanation"]
