.PHONY: help install lint format typecheck test check \
       fe-install fe-lint fe-typecheck fe-test fe-build \
       check-all dev dev-split build package prod clean bump-version

# ──────────────────────────── Python (backend) ────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install Python deps (inc. dev group)
	uv sync --group dev

lint: ## Ruff lint + format check (Python)
	uv run ruff check gamegobler
	uv run ruff format --check gamegobler

format: ## Auto-format Python code
	uv run ruff check --fix gamegobler
	uv run ruff format gamegobler

typecheck: ## Pyright type check (Python)
	uv run pyright gamegobler

test: ## Run pytest
	uv run pytest; ret=$$?; if [ $$ret -eq 5 ]; then echo "(no tests collected — ok for now)"; else exit $$ret; fi

check: lint typecheck test ## All Python checks

# ──────────────────────────── Frontend (web) ──────────────────────────────

fe-install: ## Install frontend deps
	cd web && npm install

fe-lint: ## ESLint + TypeScript check (frontend)
	cd web && npx eslint .
	cd web && npx tsc -b

fe-typecheck: ## TypeScript only (no emit)
	cd web && npx tsc -b

fe-test: ## Run vitest
	cd web && npx vitest run

fe-build: ## Production build (frontend)
	cd web && npx tsc -b && npx vite build

# ──────────────────────────── Combined ────────────────────────────────────

check-all: check fe-lint fe-test ## Full repo health check

build: fe-build ## Build frontend and verify backend can serve it
	@echo "✓ Frontend built to web/dist/ — run 'make prod' to start"

prod: build ## Start single-process production server
	uv run gamegobler-api

dev-split: ## Start backend + frontend dev servers (hot reload)
	@echo "Starting backend on http://127.0.0.1:8000 ..."
	@uv run gamegobler-api &
	@echo "Starting frontend on http://localhost:5173 ..."
	@cd web && npx vite

dev: dev-split ## Alias for dev-split

clean: ## Remove build artifacts
	rm -rf web/dist .venv .pytest_cache .ruff_cache gamegobler/__pycache__ \
		gamegobler/**/__pycache__ web/node_modules/.vite build dist

package: build ## Build single-binary with PyInstaller
	uv run pyinstaller gamegobler.spec --noconfirm
	@echo "✓ Binary at dist/GameGobler"

bump-version: ## Bump version: make bump-version V=1.0.0
	@test -n "$(V)" || (echo "Usage: make bump-version V=1.0.0" && exit 1)
	@sed -i'' -e 's/^version = .*/version = "$(V)"/' pyproject.toml && rm -f pyproject.toml-e
	@sed -i'' -e 's/^__version__ = .*/__version__ = "$(V)"/' gamegobler/__init__.py && rm -f gamegobler/__init__.py-e
	@cd web && npm version $(V) --no-git-tag-version --allow-same-version
	@echo "✓ Version bumped to $(V) in pyproject.toml, __init__.py, package.json"
