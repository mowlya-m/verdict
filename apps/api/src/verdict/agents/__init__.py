"""Agents. Every one of them returns evidence; none returns a verdict.

`intake` reads a claimant's own words and produces structured facts. Later
additions (policy retrieval, vision, communications) sit alongside it under the
same rule, which ADR-0002 sets out in full.

The engine is the only module in this codebase permitted to produce an outcome.
"""

from .intake import Extraction, IntakeError, extract

__all__ = ["Extraction", "IntakeError", "extract"]
