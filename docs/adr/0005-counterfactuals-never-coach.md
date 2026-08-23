# ADR-0005: Counterfactuals never suggest changing what happened

- **Status:** Accepted
- **Date:** 2026-08-21
- **Deciders:** Mowlya Shree Manjunatha

## Context

Because `decide()` is a pure function, the system can answer a question no
model-driven system can answer honestly: what single change would alter this
outcome. Flip one fact, re-run, compare. The money that comes back is
arithmetic, not a prediction.

That capability has an obvious dark edge. The same machinery that says "supply
the police report and this becomes payable at $1,780" can say "if the driver
had held a licence this would have been accepted". The first is service. The
second is a description of how to get a claim paid by misrepresenting it, and
publishing it to a claimant is coaching fraud.

The distinction is not about phrasing. It is about which facts a person could
legitimately change after the loss has already happened.

## Decision

Facts split into two sets.

**Levers.** Things that can still legitimately change: a document not yet
supplied, a pre-existing condition not yet assessed by a practitioner, a
discrepancy not yet explained, a specialist review not yet completed. These are
surfaced with the real outcome and the real money.

**Fixed facts.** The date of the loss, the peril, what was damaged, when cover
began. A claimant can only change these by lying. `FIXED_FACTS` names them and
no perturbation is ever generated for one.

Where a fixed fact is what decides the claim, it is reported as `IMMOVABLE`
with a **null outcome and null money**, so it can never render as something
achievable. The claimant-facing answer becomes "nothing you can supply would
change this", which is the honest and genuinely useful thing to say.

Levers also carry a `kind`, because who should act matters. A vulnerability
signal is the insurer's work, never framed as something the claimant should
withdraw.

## Consequences

**Accepted**

- `is_settled` tells a person when to stop chasing, which no claims system
  currently does.
- An assessor can see how much rests on a single gate before spending an hour
  on the file.
- The immovable case still carries information: an assessor learns the claim
  would otherwise have been accepted, which is exactly what an AFCA reviewer
  will ask about.
- `test_never_suggests_changing_what_happened` fails the build if the line
  moves.

**Rejected alternatives**

- *Surfacing every perturbation and letting the interface filter.* Puts the
  safety property in the layer most likely to be rewritten.
- *Asking a model to explain what would change the outcome.* It would answer
  fluently and without grounding, and the money would be invented.
- *Suppressing immovable facts entirely.* Loses the information an assessor
  most needs, and leaves the claimant with an unexplained refusal.

## Compliance impact

Counterfactual output is claimant-facing and therefore falls under the General
Insurance Code of Practice obligations on clear communication. It must never
constitute advice on how to obtain a payment the policy does not provide.
