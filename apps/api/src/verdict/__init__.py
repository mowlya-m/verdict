"""Verdict: a deterministic claims decision core for Australian general insurance.

Two product lines share one contract. `engine.decide()` handles motor and home,
`health_engine.decide_health()` handles private health. Both return a
`ReasonsRecord` carrying five possible outcomes, the gates that produced them,
and the clauses relied on. Neither makes a model call.
"""
