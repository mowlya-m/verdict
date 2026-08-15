# ADR-0003: Integrity signals, never a fraud verdict

- **Status:** Accepted
- **Date:** 2026-08-17
- **Deciders:** Mowlya Shree Manjunatha

## Context

Detecting suspicious claims is commercially valuable and the natural label for
the component is "fraud agent". That label is a liability.

An automated system that categorises a claimant as fraudulent creates
defamation exposure and an unfair-treatment problem under the Code. No insurer's
compliance function will approve a pipeline where a model's output is a fraud
determination. Separately, the standard feature set for fraud scoring —
customer claims history, cross-policy patterns, prior loss frequency — requires
a claims portfolio this project does not have.

## Decision

The component is named `integrity` and it emits `IntegrityFlag` objects, each
with a code, a human-readable detail and a weight of 1 to 3. It never emits a
probability, a label, or a verdict.

Flags never cause `DECLINE`. Above the escalation threshold the engine returns
`ESCALATE` with the flags attached, and a human decides.

Every check operates on a single claim with no external history: loss date
against policy inception, notification lag, EXIF capture timestamps against the
stated loss date, perceptual hash collisions between submitted images, repair
quote against the estimate band, and quoted line items against the parts the
vision agent actually found damage on.

## Consequences

**Accepted**

- Legally defensible and buildable with no historical data.
- Weights are inspectable integers rather than an opaque score.
- The checks work on day one for a customer with no claims history.

**Rejected alternatives**

- *Gradient-boosted fraud classifier.* Requires labelled historical claims. Any
  version trained on synthetic data is a liability in front of anyone who works
  in claims.
- *Letting high scores auto-decline.* Fastest possible route to a regulatory
  problem.
