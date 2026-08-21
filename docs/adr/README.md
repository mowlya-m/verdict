# Architecture decision records

| # | Title | Status |
|---|---|---|
| [0001](0001-monorepo-with-workspace-split.md) | Monorepo with an api and web workspace split | Accepted |
| [0002](0002-deterministic-decision-engine.md) | The decision engine contains no model calls | Accepted |
| [0003](0003-integrity-not-fraud.md) | Integrity signals, never a fraud verdict | Accepted |
| [0004](0004-no-confidence-scores.md) | No confidence percentages in decision output | Accepted |
| [0005](0005-counterfactuals-never-coach.md) | Counterfactuals never suggest changing what happened | Accepted |

ADRs are immutable once accepted. To change a decision, write a new record and
mark the old one `Superseded by ADR-XXXX`.

New record: `cp template.md 00XX-short-title.md`
