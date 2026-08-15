## What

<!-- One paragraph. The diff shows what changed; say what it means. -->

## Why

<!-- The problem this solves. Link the issue. -->

Closes #

## Decision boundary check

- [ ] No agent in this diff returns a verdict. Agents return evidence; `engine.decide()` returns outcomes.
- [ ] No model call inside `engine.py`, `integrity.py` or `clock.py`.
- [ ] Any new regulatory constant lives in a single module, not inline.

## Compliance

<!-- Delete if the `compliance` label does not apply. -->

- Obligation touched:
- Where encoded:
- How tested:

## Verification

```
make test
```

- [ ] Tests added or updated for the behaviour changed
- [ ] `ruff` and `mypy` clean
- [ ] Eval agreement rate did not regress
- [ ] ADR added or updated if this changes an architectural decision
