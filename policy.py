"""Policy agent.

Retrieves clause IDs and text for the PDS version in force at the date of
loss. Never the version in force today, never the version currently being
sold to new customers — the one the policyholder actually held cover under.

Enforced boundary: this agent returns `PolicyClause` objects (id, heading,
text, kind). It never decides whether a clause applies to this claim in the
sense of "therefore covered" or "therefore excluded" — that is `engine.py`'s
job, reading the clauses this agent hands it. Where an exclusion's relevance
depends on a fact about the claim (an unlicensed driver, gradual damage), this
agent is told that fact as a `signal` by its caller — who got it from intake,
vision, or a human — rather than inferring it itself. Matching a known fact to
a clause ID is retrieval. Deciding the fact happened is judgement, and stays
out of this file.

The README's architecture table calls this layer "RAG". Production embeds PDS
text and retrieves by similarity, refreshed on every reissue. That similarity
step is not where a wrong decision comes from — a mismatched embedding mostly
just under- or over-retrieves clauses, and a human reviewing a thin reasons
record will notice. Reaching back into a PDS version the customer never held
is worse, because it looks exactly like a correct decision. So this module
skips the embedding store and keeps only the part worth testing hard: a small
versioned document library keyed by product and effective date, selected on
`date_of_loss` and nothing else.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from ..schemas import PolicyClause


@dataclass(frozen=True)
class PDSClause:
    """One clause as it is written in a specific PDS version."""

    clause_id: str
    heading: str
    text: str
    kind: str  # "insuring" | "exclusion" | "condition" | "excess"
    perils: frozenset[str] | None = None  # insuring: perils this clause covers
    applies_if: frozenset[str] = frozenset()  # exclusion: signal that triggers it


@dataclass(frozen=True)
class PDSDocument:
    """One dated version of one product's PDS."""

    product: str
    pds_version: str
    effective_from: date
    effective_to: date
    clauses: tuple[PDSClause, ...]


class PolicyRetrievalError(RuntimeError):
    """No PDS document in the library covers the claimed date of loss.

    This is a gap in the document library, not evidence of a gap in cover —
    conflating the two would let a missing record silently become a decline.
    The caller must treat it as "cannot decide yet", the same as any other
    missing evidence.
    """


# --- the library ---
#
# Two dated versions of the motor PDS and one of home. Clause 7.2 is present
# in both motor versions with different wording (the 2025-07 reissue extended
# accidental collision cover to a legally parked vehicle), which is what makes
# get-the-version-wrong an observable bug rather than a theoretical one.

_PDS_LIBRARY: tuple[PDSDocument, ...] = (
    PDSDocument(
        product="motor",
        pds_version="MTR-2024-07",
        effective_from=date(2024, 7, 1),
        effective_to=date(2025, 6, 30),
        clauses=(
            PDSClause(
                clause_id="7.2",
                heading="Accidental collision",
                text=(
                    "We cover loss or damage to your vehicle caused by accidental "
                    "collision with another vehicle or object."
                ),
                kind="insuring",
                perils=frozenset({"motor_collision"}),
            ),
            PDSClause(
                clause_id="7.4",
                heading="Theft",
                text=(
                    "We cover loss of your vehicle by theft, and damage caused "
                    "during the theft or an attempt at it."
                ),
                kind="insuring",
                perils=frozenset({"motor_theft"}),
            ),
            PDSClause(
                clause_id="9.1",
                heading="Unlicensed driver",
                text=(
                    "We do not cover a claim if, at the time of the incident, the "
                    "vehicle was being driven by a person who did not hold a valid "
                    "licence for that vehicle."
                ),
                kind="exclusion",
                applies_if=frozenset({"unlicensed_driver"}),
            ),
            PDSClause(
                clause_id="9.6",
                heading="Wear and tear",
                text=(
                    "We do not cover loss or damage caused by wear, tear, or gradual deterioration."
                ),
                kind="exclusion",
                applies_if=frozenset({"wear_and_tear"}),
            ),
        ),
    ),
    PDSDocument(
        product="motor",
        pds_version="MTR-2025-07",
        effective_from=date(2025, 7, 1),
        effective_to=date(2099, 12, 31),
        clauses=(
            PDSClause(
                clause_id="7.2",
                heading="Accidental collision",
                text=(
                    "We cover loss or damage to your vehicle caused by accidental "
                    "collision with another vehicle or object, including while your "
                    "vehicle is legally parked and unattended."
                ),
                kind="insuring",
                perils=frozenset({"motor_collision"}),
            ),
            PDSClause(
                clause_id="7.4",
                heading="Theft",
                text=(
                    "We cover loss of your vehicle by theft, and damage caused "
                    "during the theft or an attempt at it."
                ),
                kind="insuring",
                perils=frozenset({"motor_theft"}),
            ),
            PDSClause(
                clause_id="7.9",
                heading="Storm and flood",
                text="We cover loss or damage caused directly by storm, flood, or hail.",
                kind="insuring",
                perils=frozenset({"motor_weather"}),
            ),
            PDSClause(
                clause_id="9.1",
                heading="Unlicensed driver",
                text=(
                    "We do not cover a claim if, at the time of the incident, the "
                    "vehicle was being driven by a person who did not hold a valid "
                    "licence for that vehicle."
                ),
                kind="exclusion",
                applies_if=frozenset({"unlicensed_driver"}),
            ),
            PDSClause(
                clause_id="9.6",
                heading="Wear and tear",
                text=(
                    "We do not cover loss or damage caused by wear, tear, or gradual deterioration."
                ),
                kind="exclusion",
                applies_if=frozenset({"wear_and_tear"}),
            ),
        ),
    ),
    PDSDocument(
        product="home",
        pds_version="HOM-2024-01",
        effective_from=date(2024, 1, 1),
        effective_to=date(2099, 12, 31),
        clauses=(
            PDSClause(
                clause_id="4.1",
                heading="Storm, fire and impact",
                text=(
                    "We cover loss or damage to your home caused by storm, fire, "
                    "explosion, or impact from a vehicle or falling object."
                ),
                kind="insuring",
                perils=frozenset({"home_weather"}),
            ),
            PDSClause(
                clause_id="4.3",
                heading="Theft and burglary",
                text=(
                    "We cover loss or damage caused by theft or attempted theft "
                    "involving forcible and violent entry to your home."
                ),
                kind="insuring",
                perils=frozenset({"home_theft"}),
            ),
            PDSClause(
                clause_id="6.2",
                heading="Gradual damage",
                text="We do not cover loss or damage that happens gradually, including damp, "
                "rust, and mould.",
                kind="exclusion",
                applies_if=frozenset({"gradual_damage"}),
            ),
        ),
    ),
)


def _document_in_force(product: str, on: date) -> PDSDocument | None:
    candidates = [
        d for d in _PDS_LIBRARY if d.product == product and d.effective_from <= on <= d.effective_to
    ]
    if not candidates:
        return None
    # PDS periods should never overlap — a reissue closes the prior version the
    # day before the new one starts. If the library ever violates that, prefer
    # the version that started most recently, since that is the one an
    # underwriter would treat as authoritative.
    return max(candidates, key=lambda d: d.effective_from)


def retrieve_clauses(
    *,
    product: str,
    peril: str,
    date_of_loss: date,
    signals: frozenset[str] = frozenset(),
) -> tuple[list[PolicyClause], str]:
    """Return clauses relevant to this claim, from the PDS in force on `date_of_loss`.

    `signals` are established facts the caller already has — from intake,
    vision, or a human — that determine which exclusions are on point (for
    example `{"unlicensed_driver"}`). This function matches facts to clause
    text; it does not establish the facts.

    Returns `(clauses, pds_version)` so the reasons record can cite exactly
    which PDS version the decision was made against. Raises
    `PolicyRetrievalError` if no document in the library covers the date.

    The one rule this function exists to protect: selection keys on
    `date_of_loss` alone. A policy reissued after the loss must not reach back
    and reinterpret a claim under wording the customer never held, and a
    caller cannot get that wrong by passing today's date instead — there is no
    parameter for today's date to go in.
    """
    document = _document_in_force(product, date_of_loss)
    if document is None:
        raise PolicyRetrievalError(
            f"No {product} PDS on file covers a loss dated {date_of_loss.isoformat()}."
        )

    matched = [
        PolicyClause(clause_id=c.clause_id, heading=c.heading, text=c.text, kind=c.kind)
        for c in document.clauses
        if c.kind == "insuring" and c.perils is not None and peril in c.perils
    ]
    matched += [
        PolicyClause(clause_id=c.clause_id, heading=c.heading, text=c.text, kind=c.kind)
        for c in document.clauses
        if c.kind == "exclusion" and c.applies_if & signals
    ]
    return matched, document.pds_version
