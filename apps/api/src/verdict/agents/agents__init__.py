"""Agents. Every one of them returns evidence; none returns a verdict.

`intake` reads a claimant's own words and produces structured facts. `policy`
retrieves clause text from the PDS in force at the date of loss. Later
additions (vision, communications) sit alongside them under the same rule,
which ADR-0002 sets out in full.

The engine is the only module in this codebase permitted to produce an outcome.
"""

from .intake import Extraction, IntakeError, extract
from .policy import PolicyRetrievalError, retrieve_clauses

__all__ = [
    "Extraction",
    "IntakeError",
    "PolicyRetrievalError",
    "extract",
    "retrieve_clauses",
]
