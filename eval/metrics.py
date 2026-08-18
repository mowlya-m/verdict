"""Three numbers. Only one of them is allowed to be bad.

    agreement            engine landed where AFCA landed
    escalation_precision of the files the engine refused to decide, how many
                         did AFCA go on to overturn the insurer on
    false_confidence     engine decided outright and AFCA said otherwise

false_confidence is the one that matters. An engine that escalates too often
is annoying. An engine that confidently declines a claim AFCA would have paid
is a regulatory problem, and it is the number to lead with precisely because
it is the one that makes you look worst.
"""

from __future__ import annotations

from dataclasses import dataclass

from .schema import AfcaOutcome, DeterminationCase


@dataclass
class Result:
    case: DeterminationCase
    engine_outcome: str
    gates_failed: list[str]

    @property
    def decided(self) -> bool:
        return self.engine_outcome in ("accept", "decline", "partial")

    @property
    def agrees(self) -> bool:
        return self.engine_outcome == self.case.correct_call

    @property
    def falsely_confident(self) -> bool:
        """Decided outright, and got it wrong. The number that must stay near zero."""
        return self.decided and self.engine_outcome != self.case.correct_call


@dataclass
class Report:
    results: list[Result]

    @property
    def n(self) -> int:
        return len(self.results)

    @property
    def agreement(self) -> float:
        return self._rate(r.agrees for r in self.results)

    @property
    def decided_rate(self) -> float:
        return self._rate(r.decided for r in self.results)

    @property
    def false_confidence(self) -> float:
        return self._rate(r.falsely_confident for r in self.results)

    @property
    def escalation_precision(self) -> float:
        """Of escalated files, the share where AFCA overturned the insurer.

        High is good. It means the engine held back on exactly the files that
        would otherwise have gone wrong.
        """
        esc = [r for r in self.results if r.engine_outcome == "escalate"]
        if not esc:
            return 0.0
        good = sum(1 for r in esc if r.case.afca_outcome is not AfcaOutcome.AFFIRMED)
        return good / len(esc)

    def by_product(self) -> dict[str, float]:
        out: dict[str, list[bool]] = {}
        for r in self.results:
            out.setdefault(r.case.product, []).append(r.agrees)
        return {k: sum(v) / len(v) for k, v in out.items()}

    def confusion(self) -> dict[str, dict[str, int]]:
        m: dict[str, dict[str, int]] = {}
        for r in self.results:
            m.setdefault(r.case.correct_call, {}).setdefault(r.engine_outcome, 0)
            m[r.case.correct_call][r.engine_outcome] += 1
        return m

    def failures(self) -> list[Result]:
        return [r for r in self.results if r.falsely_confident]

    def _rate(self, it) -> float:
        vals = list(it)
        return sum(vals) / len(vals) if vals else 0.0

    def to_markdown(self, min_agreement: float, max_false_confidence: float) -> str:
        ok = self.agreement >= min_agreement and self.false_confidence <= max_false_confidence
        lines = [
            "## Eval — AFCA determinations",
            "",
            f"**{'PASS' if ok else 'FAIL'}** · {self.n} cases",
            "",
            "| Metric | Value | Gate |",
            "| --- | --- | --- |",
            f"| Agreement with AFCA | {self.agreement:.1%} | ≥ {min_agreement:.0%} |",
            f"| False confidence | {self.false_confidence:.1%} | ≤ {max_false_confidence:.0%} |",
            f"| Escalation precision | {self.escalation_precision:.1%} | — |",
            f"| Decided without a person | {self.decided_rate:.1%} | — |",
            "",
            "### Agreement by product",
            "",
        ]
        for p, v in sorted(self.by_product().items()):
            lines.append(f"- **{p}** {v:.1%}")

        bad = self.failures()
        if bad:
            lines += ["", "### Decided wrongly with confidence", ""]
            for r in bad:
                lines.append(
                    f"- `{r.case.case_id}` engine said **{r.engine_outcome}**, "
                    f"AFCA implies **{r.case.correct_call}** "
                    f"([determination]({r.case.source_url}))"
                )
        lines += [
            "",
            "<sub>Labels derive from de-identified determinations published by the "
            "Australian Financial Complaints Authority, which is their maker and author. "
            "Analysis here is the repository author's, not AFCA's.</sub>",
        ]
        return "\n".join(lines)
