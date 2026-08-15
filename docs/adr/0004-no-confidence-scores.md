# ADR-0004: No confidence percentages in decision output

- **Status:** Accepted
- **Date:** 2026-08-17
- **Deciders:** Mowlya Shree Manjunatha

## Context

Claims tooling conventionally surfaces a confidence figure — "Recommendation:
Approve, Confidence: 94%" — and uses a threshold to gate automation.

A number produced by a language model asked how confident it is has no
calibration. It cannot be validated, it cannot be back-tested, and the first
question any informed reviewer asks is what it is calibrated against. There is
no good answer.

## Decision

Decision output contains no aggregate confidence percentage. What it contains
instead:

- Which of the seven gates passed and which failed, each with its basis.
- The clause IDs relied on.
- Integrity flags with integer weights.
- Detection confidence on individual vision findings, scoped explicitly to *did
  the model see this part*, never to *is this decision correct*.

System-level accuracy is reported separately, measured against published AFCA
determinations: agreement rate, escalation precision, and false confidence rate.
Those numbers are calibrated against real adjudicated outcomes.

## Consequences

**Accepted**

- Every claim about accuracy traces to a measurement.
- Automation is gated on named rules, not on an opaque threshold.
- Removes the weakest point in a technical review.

**Rejected alternatives**

- *Model-reported confidence.* Uncalibrated.
- *Calibrating on synthetic claims.* Measures agreement with the fixture author.
