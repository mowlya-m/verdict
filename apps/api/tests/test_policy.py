"""Policy agent.

The regression test that matters is the first one: retrieval must key on
`date_of_loss`, never on today. Everything else here is normal coverage of the
matching logic.
"""

from datetime import date

import pytest

from verdict.agents.policy import PolicyRetrievalError, retrieve_clauses

# --- the boundary. this is the test that matters. ---


def test_retrieves_the_pds_in_force_at_date_of_loss_not_today():
    """A claim notified long after the loss must not be decided under a PDS

    reissued in between. The 2024-07 motor PDS and the 2025-07 reissue both
    define clause 7.2, with different wording — the reissue extends cover to
    a legally parked vehicle. A claim for a collision that happened under the
    old wording must get the old wording, even though "today" (when this
    function runs, or when the claim happens to be assessed) is well inside
    the new PDS's period.
    """
    old_loss = date(2025, 3, 11)  # inside MTR-2024-07, well before MTR-2025-07 starts
    clauses, pds_version = retrieve_clauses(
        product="motor", peril="motor_collision", date_of_loss=old_loss
    )

    assert pds_version == "MTR-2024-07"
    (collision,) = [c for c in clauses if c.clause_id == "7.2"]
    assert "legally parked" not in collision.text

    new_loss = date(2025, 8, 4)  # inside MTR-2025-07
    clauses, pds_version = retrieve_clauses(
        product="motor", peril="motor_collision", date_of_loss=new_loss
    )

    assert pds_version == "MTR-2025-07"
    (collision,) = [c for c in clauses if c.clause_id == "7.2"]
    assert "legally parked" in collision.text


def test_no_document_covers_a_date_before_the_library_starts():
    with pytest.raises(PolicyRetrievalError, match="1999-01-01"):
        retrieve_clauses(product="motor", peril="motor_collision", date_of_loss=date(1999, 1, 1))


def test_no_document_covers_an_unknown_product():
    with pytest.raises(PolicyRetrievalError):
        retrieve_clauses(product="travel", peril="travel_medical", date_of_loss=date(2025, 6, 1))


# --- insuring clauses match on peril ---


def test_insuring_clause_matches_its_peril():
    clauses, _ = retrieve_clauses(
        product="motor", peril="motor_theft", date_of_loss=date(2025, 8, 4)
    )
    ids = {c.clause_id for c in clauses if c.kind == "insuring"}
    assert ids == {"7.4"}


def test_a_peril_with_no_insuring_clause_in_this_pds_returns_none():
    """motor_weather has no insuring clause until the 2025-07 reissue."""
    clauses, _ = retrieve_clauses(
        product="motor", peril="motor_weather", date_of_loss=date(2025, 1, 1)
    )
    assert [c for c in clauses if c.kind == "insuring"] == []

    clauses, _ = retrieve_clauses(
        product="motor", peril="motor_weather", date_of_loss=date(2025, 8, 4)
    )
    ids = {c.clause_id for c in clauses if c.kind == "insuring"}
    assert ids == {"7.9"}


def test_wrong_product_does_not_leak_clauses():
    clauses, _ = retrieve_clauses(
        product="home", peril="home_weather", date_of_loss=date(2025, 8, 4)
    )
    ids = {c.clause_id for c in clauses}
    assert ids.issubset({"4.1"})  # never 7.2, 7.4, 7.9, 9.1, 9.6 from the motor PDS


# --- exclusions only surface when the triggering fact is supplied ---


def test_exclusion_absent_with_no_signal():
    clauses, _ = retrieve_clauses(
        product="motor", peril="motor_collision", date_of_loss=date(2025, 8, 4)
    )
    assert [c for c in clauses if c.kind == "exclusion"] == []


def test_exclusion_present_when_its_signal_is_supplied():
    clauses, _ = retrieve_clauses(
        product="motor",
        peril="motor_collision",
        date_of_loss=date(2025, 8, 4),
        signals=frozenset({"wear_and_tear"}),
    )
    ids = {c.clause_id for c in clauses if c.kind == "exclusion"}
    assert ids == {"9.6"}


def test_unrelated_signal_does_not_surface_an_exclusion():
    clauses, _ = retrieve_clauses(
        product="motor",
        peril="motor_collision",
        date_of_loss=date(2025, 8, 4),
        signals=frozenset({"some_other_fact"}),
    )
    assert [c for c in clauses if c.kind == "exclusion"] == []


def test_multiple_signals_can_surface_multiple_exclusions():
    clauses, _ = retrieve_clauses(
        product="motor",
        peril="motor_collision",
        date_of_loss=date(2025, 8, 4),
        signals=frozenset({"wear_and_tear", "unlicensed_driver"}),
    )
    ids = {c.clause_id for c in clauses if c.kind == "exclusion"}
    assert ids == {"9.1", "9.6"}


# --- the boundary. clauses carry no verdict, by construction. ---


def test_policy_clause_has_no_field_that_could_express_a_verdict():
    """Structural, like the equivalent intake test. There is nowhere to put

    "covered" or "excluded" — a PolicyClause is id, heading, text and kind,
    and the engine is what turns that into an outcome.
    """
    clauses, _ = retrieve_clauses(
        product="motor", peril="motor_collision", date_of_loss=date(2025, 8, 4)
    )
    fields = {f for c in clauses for f in vars(c)}
    assert fields == {"clause_id", "heading", "text", "kind"}
