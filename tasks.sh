#!/usr/bin/env bash
# Repo tasks: ./tasks.sh contract | contract-check | check | wheel
set -euo pipefail
cd "$(dirname "$0")"

contract() {
  (cd daemon && poetry run muxtowerd export-openapi) > openapi.json
  (cd app && npm run --silent gen:api)
}

contract_check() {
  contract
  git diff --exit-code -- openapi.json app/src/lib/api/schema.d.ts
}

check() {
  (cd daemon && poetry run ruff check . && poetry run ruff format --check . && poetry run mypy src && poetry run pytest -q)
  (cd app && npm run lint && npm run typecheck && npm test)
  contract_check
}

wheel() {
  (cd app && npm ci && npm run build)
  rm -rf daemon/src/muxtower/web && cp -r app/dist daemon/src/muxtower/web
  (cd daemon && poetry build)
}

case "${1:-}" in
  contract) contract ;;
  contract-check) contract_check ;;
  check) check ;;
  wheel) wheel ;;
  *) echo "usage: $0 contract|contract-check|check|wheel" >&2; exit 2 ;;
esac
