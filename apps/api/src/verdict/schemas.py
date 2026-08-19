"""Structured claim record. Agents populate this; the engine reads it.

Design rule: every field an agent writes is EVIDENCE, never a verdict.
The policy agent writes clause IDs. It does not write "covered".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum

from .clock import ClockStatus


class Outcome(StrEnum):
    ACCEPT = "accept"
    PARTIAL = "partial"
    DECLINE = "decline"
    REQUEST_EVIDENCE = "request_evidence"
    ESCALATE = "escalate"


class Severity(StrEnum):
    LIGHT = "light"
    MODERATE = "moderate"
    HEAVY = "heavy"
    UNDETERMINABLE = "undeterminable"


@dataclass
class PolicyClause:
    """A retrieved clause.

    `clause_id` must survive retrieval intact, or the reasons record is
    worthless in a dispute.
    """

    clause_id: str
    heading: str
    text: str
    kind: str  # "insuring" | "exclusion" | "condition" | "excess"


@dataclass
class Policy:
    policy_number: str
    product: str
    pds_version: str
    effective_from: date
    effective_to: date
    inception: date
    excess: float
    insured_value: float | None = None


@dataclass
class DamageFinding:
    part: str
    severity: Severity
    confidence: float  # model confidence in the DETECTION, not in the decision
    source_image: str


@dataclass
class IntegrityFlag:
    code: str
    detail: str
    weight: int  # 1 minor, 2 material, 3 serious


@dataclass
class EvidenceItem:
    kind: str
    present: bool
    reference: str | None = None


@dataclass
class Claim:
    claim_id: str
    policy: Policy
    date_of_loss: date
    date_notified: date
    peril: str
    narrative: str

    # populated by agents
    clauses: list[PolicyClause] = field(default_factory=list)
    damage: list[DamageFinding] = field(default_factory=list)
    integrity: list[IntegrityFlag] = field(default_factory=list)
    evidence: list[EvidenceItem] = field(default_factory=list)

    quote_total: float | None = None
    estimate_low: float | None = None
    estimate_high: float | None = None

    vulnerability_signals: list[str] = field(default_factory=list)

    # clock
    all_info_received_on: date | None = None
    decided_on: date | None = None


@dataclass
class Gate:
    n: int
    name: str
    passed: bool
    basis: str
    citation: str | None = None
    blocking: bool = True


@dataclass
class ReasonsRecord:
    """What gets handed to a human, a customer, or AFCA. This is the product."""

    claim_id: str
    outcome: Outcome
    gates: list[Gate]
    payable: float | None
    excess_applied: float | None
    missing_evidence: list[str]
    escalation_reasons: list[str]
    clauses_relied_on: list[str]
    clock: ClockStatus

    def summary(self) -> str:
        failed = [g for g in self.gates if not g.passed]
        if self.outcome is Outcome.ACCEPT:
            return (
                f"All {len(self.gates)} gates cleared. "
                f"Payable {self.payable:,.2f} after {self.excess_applied:,.2f} excess."
            )
        if self.outcome is Outcome.REQUEST_EVIDENCE:
            return "Cannot decide yet. Missing: " + ", ".join(self.missing_evidence)
        if self.outcome is Outcome.ESCALATE:
            return "Held for a human. " + " ".join(self.escalation_reasons)
        return " ".join(g.basis for g in failed)
