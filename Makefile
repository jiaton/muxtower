.PHONY: contract contract-check check wheel

contract:
	cd daemon && poetry run python -c "from muxtower.cli.serve import print_openapi; print_openapi()" > ../openapi.json
	cd app && npm run --silent gen:api

contract-check: contract
	git diff --exit-code -- openapi.json app/src/lib/api/schema.d.ts

check:
	cd daemon && poetry run ruff check . && poetry run ruff format --check . && poetry run mypy src && poetry run pytest -q
	cd app && npm run lint && npm run typecheck && npm test
	$(MAKE) contract-check

wheel:
	cd app && npm ci && npm run build
	rm -rf daemon/src/muxtower/web && cp -r app/dist daemon/src/muxtower/web
	cd daemon && poetry build
