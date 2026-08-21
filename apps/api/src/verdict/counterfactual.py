"""Counterfactuals. What would have to be different for this to come out another way.

A decline that says "clause 9.4 applies" is defensible. A decline that also says
"and nothing you can now do will change that" is *useful*, and so is one that
says "supply the police report and this becomes payable at $3,290". People and
assessors both need the second thing, and neither can get it from a
recommendation.

This is only possible because `decide()` is a pure function. Flip one fact,
re-run, compare. A system where a model produces the outcome cannot do this
honestly: you would be asking it to speculate about its own reasoning, and it
would oblige. Here the answer is arithmetic.

THE LINE THAT MATTERS
---------------------
Some facts can legitimately change. A missing document can be supplied, a
pre-existing condition can be assessed by a practitioner, a discrepancy can be
explained. Those are levers, and telling someone about them is service.

Other facts cannot change without someone lying. The date of the loss, what
actually happened, whether the driver held a licence. Surfacing those as
"levers" would be coaching a person to misrepresent a claim, so this module
will not do it, and `FIXED_FACTS` names them explicitly. Where such a fact is
what blocked the claim, the answer is that nothing can change it, and saying so
plainly is the honest outcome.

`test_never_suggests_changing_what_happened` is the test that holds that line.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from .engine import decide
from .schemas import Claim, EvidenceItem, Outcome, ReasonsRecord

#: Facts a claimant could only change by misrepresenting the loss. Never a lever.
FIXED_FACTS = frozenset(
    {
        "date_of_loss",
        "peril",
        "narrative",
        "damage",
        "policy.inception",
        "policy.effective_from",
        "policy.effective_to",
    }
)


class Kind(StrEnum):
    """What sort of thing a lever is, which governs who should act on it."""

    CLAIMANT = "claimant"  # the person can do this themselves
    INSURER = "insurer"  # the insurer must arrange it
    PRACTITIONER = "practitioner"  # only a qualified third party can
    IMMOVABLE = "immovable"  # nothing can change this, and that is the answer


@dataclass(frozen=True)
class Lever:
    """One change, and what it would do.

    `outcome` is the real result of re-running the engine with the change
    applied, not a prediction. `payable_delta` is the difference in money.
    """

    kind: Kind
    action: str
    because: str
    outcome: Outcome | None
    payable_delta: float | None
    gate_cleared: str | None
    gaps_closed: int = 0

    @property
    def decisive(self) -> bool:
        """Report whether this alone would turn the claim into a payment."""
        return self.outcome in (Outcome.ACCEPT, Outcome.PARTIAL)

    @property
    def progresses(self) -> bool:
        """Moves the file forward without finishing it.

        Supplying one of three outstanding documents does not make a claim
        payable, but it is not nothing either, and a claimant who is told it
        achieved nothing will reasonably stop sending things.
        """
        return not self.decisive and self.gaps_closed > 0


@dataclass(frozen=True)
class Counterfactual:
    """The full answer to 'what would change this'."""

    current: Outcome
    levers: list[Lever]

    @property
    def decisive_levers(self) -> list[Lever]:
        return [x for x in self.levers if x.decisive]

    @property
    def is_settled(self) -> bool:
        """True when no legitimate change would alter the outcome.

        The most important thing this module can say. It means stop chasing.
        """
        return not self.decisive_levers

    def summary(self) -> str:
        if self.current is Outcome.ACCEPT:
            return "Already payable. Nothing to change."
        if self.is_settled:
            immovable = [x for x in self.levers if x.kind is Kind.IMMOVABLE]
            if immovable:
                return "Nothing the claimant can supply would change this. " + immovable[0].because
            return "No single change would alter this outcome."
        n = len(self.decisive_levers)
        first = self.decisive_levers[0]
        more = f" ({n - 1} other route{'s' if n > 2 else ''})" if n > 1 else ""
        return f"{first.action} and this becomes payable.{more}"

    @property
    def next_steps(self) -> list[Lever]:
        """Anything worth doing, whether or not it finishes the claim."""
        return [x for x in self.levers if x.decisive or x.progresses]


def _payable(record: ReasonsRecord) -> float:
    return record.payable or 0.0


def _with_evidence(claim: Claim, kinds: list[str]) -> Claim:
    c = copy.deepcopy(claim)
    have = {e.kind for e in c.evidence if e.present}
    c.evidence = list(c.evidence) + [EvidenceItem(k, True) for k in kinds if k not in have]
    return c


def _without_integrity(claim: Claim) -> Claim:
    c = copy.deepcopy(claim)
    c.integrity = []
    return c


def _without_vulnerability(claim: Claim) -> Claim:
    c = copy.deepcopy(claim)
    c.vulnerability_signals = []
    return c


def _without_exclusions(claim: Claim) -> Claim:
    c = copy.deepcopy(claim)
    c.clauses = [x for x in c.clauses if x.kind != "exclusion"]
    return c


def explore(claim: Claim, today: date | None = None) -> Counterfactual:
    """Re-run the decision with one fact changed at a time.

    Cheap: seven gates, a handful of perturbations, all in memory. There is no
    search and no model call, so the result is the same every time.
    """
    base = decide(claim, today=today)
    levers: list[Lever] = []

    if base.outcome is Outcome.ACCEPT:
        return Counterfactual(current=base.outcome, levers=[])

    def probe(
        candidate: Claim,
        kind: Kind,
        action: str,
        because: str,
        gate: str | None = None,
    ) -> None:
        after = decide(candidate, today=today)
        closed = len(base.missing_evidence) - len(after.missing_evidence)
        unchanged = after.outcome is base.outcome and after.payable == base.payable and closed <= 0
        if unchanged:
            return  # genuinely achieves nothing; do not send anyone chasing it
        levers.append(
            Lever(
                kind=kind,
                action=action,
                because=because,
                outcome=after.outcome,
                payable_delta=round(_payable(after) - _payable(base), 2),
                gate_cleared=gate,
                gaps_closed=max(0, closed),
            )
        )

    # --- missing evidence, one document at a time -------------------------
    # Deliberately one at a time. "Send us four things" is a wall; "send us the
    # police report and we can decide" is a next step.
    if base.missing_evidence:
        for item in base.missing_evidence:
            probe(
                _with_evidence(claim, [item]),
                Kind.CLAIMANT,
                f"Supply the {item.replace('_', ' ')}",
                "The file cannot be decided without it.",
                gate="Evidence sufficient to decide",
            )
        if len(base.missing_evidence) > 1:
            probe(
                _with_evidence(claim, list(base.missing_evidence)),
                Kind.CLAIMANT,
                "Supply all outstanding documents",
                "Every gap closed at once.",
                gate="Evidence sufficient to decide",
            )

    # --- integrity discrepancies ------------------------------------------
    # A discrepancy is not an accusation. Often there is an innocent
    # explanation, and the claimant is the only one who has it.
    if claim.integrity:
        detail = claim.integrity[0].detail
        probe(
            _without_integrity(claim),
            Kind.CLAIMANT,
            "Explain the discrepancy on file",
            detail,
            gate="Integrity checks",
        )

    # --- vulnerability ----------------------------------------------------
    # Never framed as something the claimant should withdraw. The insurer
    # completes the specialist review; the person does nothing.
    if claim.vulnerability_signals:
        probe(
            _without_vulnerability(claim),
            Kind.INSURER,
            "Complete the specialist review",
            "Support needs were identified and must be handled before settlement.",
            gate="No vulnerability signals",
        )

    # --- exclusions -------------------------------------------------------
    # Informational only. An exclusion is a fact about the loss, so this is
    # reported as immovable rather than offered as a lever. It tells an
    # assessor how much turns on that single clause.
    exclusions = [x for x in claim.clauses if x.kind == "exclusion"]
    if exclusions:
        hypothetical = decide(_without_exclusions(claim), today=today)
        levers.append(
            Lever(
                kind=Kind.IMMOVABLE,
                action="Nothing. The exclusion is a fact about the loss.",
                because=(
                    f"{exclusions[0].heading} ({exclusions[0].clause_id}) decides this "
                    f"claim on its own. Without it the outcome would be "
                    f"{hypothetical.outcome.value}."
                ),
                outcome=None,  # never presented as achievable
                payable_delta=None,
                gate_cleared=None,
            )
        )

    # --- cover period -----------------------------------------------------
    if not base.gates[0].passed:
        levers.append(
            Lever(
                kind=Kind.IMMOVABLE,
                action="Nothing. The loss fell outside the period of cover.",
                because=base.gates[0].basis,
                outcome=None,
                payable_delta=None,
                gate_cleared=None,
            )
        )

    # Decisive levers first, then by how much they recover, then immovable
    # facts last, because that is the order a person reads them in.
    levers.sort(
        key=lambda x: (
            not x.decisive,
            not x.progresses,
            -(x.payable_delta or 0),
            -x.gaps_closed,
            x.kind is Kind.IMMOVABLE,
        )
    )
    return Counterfactual(current=base.outcome, levers=levers)


def explain_gate(claim: Claim, gate_number: int, today: date | None = None) -> str:
    """Why one gate matters, in terms of what turns on it.

    Answers the assessor's real question, which is never 'what does gate five
    check' but 'how much rests on gate five'.
    """
    base = decide(claim, today=today)
    gate = next((g for g in base.gates if g.n == gate_number), None)
    if gate is None:
        return f"There is no gate {gate_number}."
    if gate.passed:
        return f"{gate.name} passed. {gate.basis}"

    relaxed = {
        4: _with_evidence(claim, list(base.missing_evidence)),
        5: _without_integrity(claim),
        7: _without_vulnerability(claim),
        3: _without_exclusions(claim),
    }.get(gate_number)

    if relaxed is None:
        return f"{gate.name} failed. {gate.basis}"

    after = decide(relaxed, today=today)
    if after.outcome is base.outcome:
        return (
            f"{gate.name} failed, but it is not what decides this claim. "
            f"Clearing it alone still leaves the outcome at {base.outcome.value}."
        )
    money = ""
    if after.payable:
        money = f" and {after.payable:,.2f} becomes payable"
    return (
        f"{gate.name} is what decides this claim. Clearing it alone moves the "
        f"outcome to {after.outcome.value}{money}."
    )
