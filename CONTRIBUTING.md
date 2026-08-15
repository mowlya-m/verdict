# Contributing

## Branching

`main` is protected. It is always green, always deployable, and only ever receives squash merges from a pull request.

```
main
 └── <type>/<area>-<short-slug>
```

| Type | Use |
|---|---|
| `feat/` | New capability |
| `fix/` | Bug fix |
| `refactor/` | Behaviour-preserving change |
| `perf/` | Performance |
| `test/` | Tests only |
| `docs/` | Documentation, ADRs |
| `chore/` | Tooling, deps, CI |

Examples:

```
feat/engine-partial-outcome
fix/clock-business-day-boundary
docs/adr-deterministic-engine
chore/ci-ruff-cache
```

## Commits

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/). Enforced in CI by `commitlint`.

```
<type>(<scope>): <subject>

<body — why, not what>

<footer — Closes #12 / BREAKING CHANGE:>
```

Scopes map to the monorepo:

`engine` · `integrity` · `clock` · `schemas` · `agents` · `api` · `web` · `eval` · `ci` · `docs` · `deps`

**Rules**

- Subject in imperative mood, lower case, no trailing period, ≤ 72 chars.
- Body explains *why*. The diff already shows *what*.
- One logical change per commit. If the body needs "and", split it.
- Never commit a failing test suite, even on a branch you plan to rebase.

**Good**

```
feat(engine): add PARTIAL outcome for split-liability claims

DECLINE and ACCEPT collapsed cases where only part of the loss was
covered, which produced a reasons record that could not survive an AFCA
dispute. PARTIAL carries its own payable calculation and clause set.

Closes #34
```

```
fix(clock): exclude the notification day from business-day counting

add_business_days counted the start date when it fell on a weekday,
putting every short-form deadline one day early.
```

**Bad**

```
update engine                     ← no type, no scope, says nothing
feat(engine): fixed stuff and also refactored the clock and added tests
Fix bug.                          ← capitalised, past tense, trailing period
WIP                               ← never on main
```

## Pull requests

Title follows the same Conventional Commits format as the squash commit it becomes.

Every PR must:

1. Reference an issue (`Closes #n`).
2. Carry exactly one `type:` label and at least one `area:` label.
3. Pass CI: `ruff`, `mypy`, `pytest`, `vitest`, `commitlint`.
4. Keep the diff under ~400 lines. Larger means it should have been two PRs.
5. Update the ADR index if it changes an architectural decision.

Squash merge only. The squash subject becomes the changelog entry, so write it properly.

## Labels

```yaml
# type — exactly one per PR
type: feature          #0E8A6E   New capability
type: fix              #B3261E   Bug fix
type: refactor         #6750A4   Behaviour-preserving
type: docs             #4A6572   Documentation or ADR
type: chore            #7C7C7C   Tooling, deps, CI
type: test             #1F6FEB   Tests only

# area — one or more
area: engine           #1F4B5F   Decision engine
area: integrity        #8A4B08   Integrity checks
area: clock            #7D4E00   Code of Practice deadlines
area: agents           #534AB7   LLM, RAG, VLM layers
area: api              #0F6E56   FastAPI service
area: web              #185FA5   Assessor console
area: eval             #993C1D   AFCA harness
area: infra            #3D3D3A   CI, deploy, tooling

# priority
priority: p0           #B3261E   Blocks the demo
priority: p1           #D9730D   This milestone
priority: p2           #8A919E   Backlog

# status
status: blocked        #6E7781
status: needs-review   #0969DA
status: needs-decision #A32B2B   Wants an ADR before code

# meta
compliance             #A32B2B   Touches a regulatory obligation
breaking               #B3261E   Changes a public contract
good first issue       #7057FF
```

Apply with [`github-label-sync`](https://github.com/Financial-Times/github-label-sync):

```bash
npx github-label-sync --access-token $GITHUB_TOKEN --labels .github/labels.yml mowlya-m/verdict
```

## The compliance rule

Any PR carrying the `compliance` label must state in its description:

- Which obligation it touches (Code clause, RG number, or Act section).
- Where the timeframe or rule is encoded.
- How it is tested.

Regulatory constants live in one place per domain (`clock.py` for timeframes) and never inline in business logic.

## Architecture decisions

Anything that changes the decision boundary between model and engine, adds a
regulatory dependency, or alters a public contract needs an ADR before the code.

```bash
cp docs/adr/template.md docs/adr/00XX-short-title.md
```

Status is one of `Proposed` · `Accepted` · `Superseded by ADR-XXXX`. ADRs are
immutable once accepted — supersede, never edit.
