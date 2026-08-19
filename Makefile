PYTHON ?= python3
API := apps/api
WEB := apps/web

.DEFAULT_GOAL := help
.PHONY: help setup test lint fmt dev eval labels clean

help: ## Show this help
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

setup: ## Install api and web dependencies
	cd $(API) && $(PYTHON) -m pip install -e '.[dev]'
	cd $(WEB) && npm install

test: ## Run the full suite
	cd $(API) && $(PYTHON) -m pytest
	cd $(WEB) && npm run test --if-present

lint: ## Lint and type-check everything
	cd $(API) && $(PYTHON) -m ruff check . && $(PYTHON) -m mypy src
	cd $(WEB) && npm run lint

fmt: ## Format
	cd $(API) && $(PYTHON) -m ruff format . && $(PYTHON) -m ruff check --fix .
	cd $(WEB) && npm run format

api: ## api only, on :8000
	cd $(API) && PYTHONPATH=src $(PYTHON) -m uvicorn verdict.api.main:app --reload --port 8000

dev: ## api on :8000, web on :5173
	cd $(API) && $(PYTHON) -m uvicorn verdict.api.main:app --reload --port 8000 & \
	cd $(WEB) && npm run dev

eval: ## Run the AFCA agreement harness
	cd $(API) && $(PYTHON) -m eval.run --fixtures ../../eval/fixtures

labels: ## Push the label taxonomy to GitHub
	npx github-label-sync --access-token $$GITHUB_TOKEN --labels .github/labels.yml mowlya-m/verdict

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf apps/web/dist apps/api/.pytest_cache apps/api/.mypy_cache
