# apps/api

The decision core. Pure Python, no network, no model calls.

## Run

```bash
cd apps/api
PYTHONPATH=src python3 -m pytest tests -q   # 14 tests
PYTHONPATH=src python3 demo.py             # four claims end to end
```

macOS with Anaconda: use `/opt/anaconda3/bin/python3.12`.

## Not built yet

`src/verdict/api/` (FastAPI routers) is BUILD_PLAN PR 10. Until it lands,
`make dev` only serves the web workspace.
