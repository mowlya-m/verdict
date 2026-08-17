# Build plan

Six milestones, 21 pull requests. Every PR is one branch, one squash merge, one
changelog line. Ordered so `main` is demoable from M2 onward.

Legend: `T` type label · `A` area label(s) · `P` priority

---

## M0 — Foundation

Get the repo defensible before any feature lands.

| # | PR title | Branch | T | A | P |
|---|---|---|---|---|---|
| 1 | `chore(infra): scaffold monorepo with api and web workspaces` | `chore/infra-monorepo-scaffold` | chore | infra | p0 |
| 2 | `chore(ci): add ruff, mypy, pytest and commitlint gates` | `chore/ci-quality-gates` | chore | infra | p0 |
| 3 | `docs: add architecture overview and ADR template` | `docs/architecture-and-adr-template` | docs | infra | p0 |
| 4 | `docs(adr): record the deterministic decision engine boundary` | `docs/adr-deterministic-engine` | docs | engine | p0 |

**PR 4 is the important one.** Write the ADR before the engine so the reasoning
is dated earlier than the implementation. That is what a reviewer looks for.

---

## M1 — Decision core

No models. No network. Pure functions and tests.

| # | PR title | Branch | T | A | P |
|---|---|---|---|---|---|
| 5 | `feat(schemas): define claim record, gates and reasons record` | `feat/schemas-claim-record` | feature | engine | p0 |
| 6 | `feat(clock): add Code of Practice deadline calculator` | `feat/clock-code-deadlines` | feature | clock | p0 |
| 7 | `feat(integrity): add within-claim discrepancy checks` | `feat/integrity-single-claim-checks` | feature | integrity | p0 |
| 8 | `feat(engine): add seven-gate decision engine with five outcomes` | `feat/engine-seven-gates` | feature | engine | p0 |
| 9 | `test(engine): cover every outcome path and clock boundary` | `test/engine-outcome-coverage` | test | engine | p1 |

PRs 6 and 7 carry the `compliance` label. PR 6's description must cite where
each timeframe comes from.

---

## M2 — Service

`main` becomes runnable here.

| # | PR title | Branch | T | A | P |
|---|---|---|---|---|---|
| 10 | `feat(api): expose POST /claims/{id}/decide over FastAPI` | `feat/api-decide-endpoint` | feature | api | p0 |
| 11 | `feat(api): add claim persistence and the paid-claims register` | `feat/api-claim-store` | feature | api | p1 |
| 12 | `chore(infra): containerise the api and add compose for local dev` | `chore/infra-docker-compose` | chore | infra | p1 |

---

## M3 — Agents

Evidence producers only. Any agent that returns a verdict fails review.

| # | PR title | Branch | T | A | P |
|---|---|---|---|---|---|
| 13 | `feat(agents): add intake extraction with structured output` | `feat/agents-intake-extraction` | feature | agents | p0 |
| 14 | `feat(agents): add PDS retrieval keyed to date of loss` | `feat/agents-policy-retrieval` | feature | agents | p0 |
| 15 | `feat(agents): add vision damage findings with severity bands` | `feat/agents-vision-damage` | feature | agents | p1 |
| 16 | `feat(agents): add reasons-record letter drafting` | `feat/agents-comms-drafting` | feature | agents | p2 |

**PR 14 must include a regression test proving the retriever selects the PDS in
force at the date of loss, not the current one.** That bug is silent and it
invalidates every coverage decision on an older claim.

---

## M4 — Evaluation

The milestone that makes the project credible.

| # | PR title | Branch | T | A | P |
|---|---|---|---|---|---|
| 17 | `feat(eval): scrape and normalise published AFCA determinations` | `feat/eval-afca-scraper` | feature | eval | p0 |
| 18 | `feat(eval): add agreement and false-confidence harness` | `feat/eval-agreement-harness` | feature | eval | p0 |
| 19 | `chore(ci): publish eval metrics on every pull request` | `chore/ci-eval-reporting` | chore | infra | p1 |

PR 19 makes the eval a gate. If agreement drops, CI fails. That is the single
strongest signal a reviewer can see in a repository.

---

## M5 — Console and deploy

| # | PR title | Branch | T | A | P |
|---|---|---|---|---|---|
| 20 | `feat(web): add assessor console with claim queue and gate trace` | `feat/web-assessor-console` | feature | web | p0 |
| 21 | `chore(infra): deploy web to Vercel and api to Fly with preview envs` | `chore/infra-deploy-pipeline` | chore | infra | p0 |

---

## Two-day compression

If the hackathon is 48 hours, this is the cut:

**Day 1** — M0 (PRs 1–4), M1 (5–9), M2 (10), M4 (17–18).
Ship the scraper and the harness on day one. Everything else is presentation.

**Day 2** — M3 (13–15), M5 (20–21).

Drop PRs 11, 12, 16, 19. Note them as `priority: p2` issues rather than
deleting them — an issue backlog that reads like a roadmap is a signal in
itself.

---

## Working the loop

```bash
gh issue create --title "Engine collapses partial coverage into decline" \
                --label "type: fix,area: engine,priority: p1"

git switch -c fix/engine-partial-coverage
# ... work, commit conventionally ...
git push -u origin fix/engine-partial-coverage

gh pr create --fill --label "type: fix,area: engine,priority: p1"
gh pr merge --squash --delete-branch
```

## Tag on milestone completion

```bash
git tag -a v0.3.0 -m "M3: evidence agents

- intake extraction with structured output
- PDS retrieval keyed to date of loss
- vision damage findings with severity bands"
git push origin v0.3.0
```

SemVer, `v0.x` until the eval agreement rate clears the target. `v1.0.0` when a
design partner runs a real claim through it.
