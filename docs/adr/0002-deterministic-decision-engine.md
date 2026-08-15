# ADR-0002: The decision engine contains no model calls

- **Status:** Accepted
- **Date:** 2026-08-17
- **Deciders:** Mowlya Shree Manjunatha

## Context

The obvious architecture is to give a language model the claim, the policy and
the photos and ask for a decision. It works in a demo. It fails for three
reasons that matter to a buyer.

**Reproducibility.** Two identical claims must produce identical decisions. A
sampled model does not guarantee that, and "we set temperature to zero" is not
an argument an insurer's risk function accepts.

**Auditability.** A declined claim may be examined by AFCA. The reasons record
must state which clause was relied on and which evidence supported it. A model's
free-text rationale is a post-hoc narrative, not a decision trace.

**Regression testing.** Encoding a new exclusion should be a testable change to
a rule, not a prompt edit whose effects on 300 other cases are unknown.

## Decision

Every layer above the engine returns **evidence only**. The policy agent returns
clause IDs and text. The vision agent returns parts and severity bands. The
integrity agent returns discrepancies with weights. `engine.decide()` is a pure
function over that evidence and contains no network call and no model call.

This is enforced by review: the pull request template requires the author to
confirm no agent in the diff returns a verdict.

## Consequences

**Accepted**

- Decisions are reproducible and diffable.
- The reasons record is derived from the same structure that produced the
  decision, so it cannot drift from it.
- Adding a rule is a unit-testable change.
- The engine runs offline, which makes the eval harness fast and free.

**Rejected alternatives**

- *LLM as judge with a rules-based sanity check.* Inverts the trust
  relationship: the unauditable layer decides and the auditable one only
  objects. Also means the reasons record is generated separately from the
  decision, so it can misdescribe it.
- *Model-produced confidence score gating automation.* See ADR-0004.

## Compliance impact

The reasons record structure is what an insurer relies on under the General
Insurance Code of Practice when explaining a decision, and what AFCA examines in
a dispute. It is produced by `ReasonsRecord` in `schemas.py` and populated only
by `engine.decide()`.
