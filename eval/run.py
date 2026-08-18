"""Run the harness. Exits non-zero when a gate fails, so CI can depend on it.

    python -m eval.run --fixtures eval/fixtures
    python -m eval.run --fixtures eval/fixtures --min-agreement 0.85 --max-false-confidence 0.02
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from verdict.engine import decide

from .adapt import to_claim
from .metrics import Report, Result
from .schema import load_dir


def run(fixtures: Path) -> Report:
    cases = load_dir(fixtures)
    if not cases:
        raise SystemExit(f"No cases in {fixtures}. Run eval.fetch first, or keep the fixtures.")
    results = []
    for case in cases:
        record = decide(to_claim(case), today=None)
        results.append(
            Result(
                case=case,
                engine_outcome=record.outcome.value,
                gates_failed=[g.name for g in record.gates if not g.passed],
            )
        )
    return Report(results)


def main() -> None:
    p = argparse.ArgumentParser(description="Score the engine against AFCA determinations")
    p.add_argument("--fixtures", type=Path, default=Path("eval/fixtures"))
    p.add_argument("--min-agreement", type=float, default=0.85)
    p.add_argument("--max-false-confidence", type=float, default=0.02)
    p.add_argument("--report", type=Path, default=Path("eval-report.md"))
    a = p.parse_args()

    report = run(a.fixtures)
    md = report.to_markdown(a.min_agreement, a.max_false_confidence)
    a.report.write_text(md)
    print(md)

    failed = report.agreement < a.min_agreement or report.false_confidence > a.max_false_confidence
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
