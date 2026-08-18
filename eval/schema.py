"""Case record for an AFCA determination, and the mapping to engine outcomes.

The mapping is the subtle part. AFCA does not emit ACCEPT / DECLINE / ESCALATE.
It either affirms what the insurer did or overturns it. So agreement is scored
against what the insurer *should* have done, which is what AFCA effectively
rules on.

    AFCA affirmed the insurer's decline   -> the correct call was DECLINE
    AFCA overturned the decline           -> the correct call was ACCEPT
    AFCA found the claim was underpaid    -> the correct call was ACCEPT
    AFCA found the process was unfair     -> the correct call was ESCALATE

ESCALATE is never counted as wrong. It is counted separately, because an
engine that refuses to decide has not made an error, it has asked for a
person. That distinction is the whole reason escalation precision exists as
a metric.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path


class AfcaOutcome(str, Enum):
    AFFIRMED = "affirmed"        # insurer's decision stood
    OVERTURNED = "overturned"    # insurer was wrong
    PROCESS_FAULT = "process"    # decision defensible, handling was not


#: What the insurer should have done, per AFCA.
CORRECT_CALL = {
    AfcaOutcome.AFFIRMED: "decline",
    AfcaOutcome.OVERTURNED: "accept",
    AfcaOutcome.PROCESS_FAULT: "escalate",
}


@dataclass
class DeterminationCase:
    """One determination, normalised into engine inputs plus a held-out label.

    `source_url` is mandatory. AFCA's licence requires an active link back to
    the page hosting the full determination in anything that reproduces or
    analyses it.
    """

    case_id: str
    source_url: str
    product: str                  # "motor" | "home" | "travel" | ...
    year: int

    # --- inputs the engine is allowed to see ---
    peril: str
    date_of_loss: str
    date_notified: str
    policy_effective_from: str
    policy_effective_to: str
    policy_inception: str
    excess: float
    insuring_clauses: list[str] = field(default_factory=list)
    exclusion_clauses: list[str] = field(default_factory=list)
    evidence_present: list[str] = field(default_factory=list)
    integrity_flags: list[dict] = field(default_factory=list)
    vulnerability_signals: list[str] = field(default_factory=list)
    quote_total: float | None = None
    estimate_high: float | None = None

    # --- held out during evaluation ---
    afca_outcome: AfcaOutcome = AfcaOutcome.AFFIRMED
    afca_reasoning_tags: list[str] = field(default_factory=list)

    # --- provenance ---
    synthetic: bool = False       # True for hand-built fixtures, never a real case
    notes: str = ""

    @property
    def correct_call(self) -> str:
        return CORRECT_CALL[self.afca_outcome]

    def to_json(self) -> dict:
        d = asdict(self)
        d["afca_outcome"] = self.afca_outcome.value
        return d

    @classmethod
    def from_json(cls, d: dict) -> DeterminationCase:
        d = dict(d)
        d["afca_outcome"] = AfcaOutcome(d["afca_outcome"])
        return cls(**d)


def load_dir(path: Path) -> list[DeterminationCase]:
    cases = []
    for f in sorted(Path(path).glob("*.json")):
        payload = json.loads(f.read_text())
        for row in payload if isinstance(payload, list) else [payload]:
            cases.append(DeterminationCase.from_json(row))
    return cases


def save(cases: list[DeterminationCase], path: Path) -> None:
    Path(path).write_text(json.dumps([c.to_json() for c in cases], indent=2))
