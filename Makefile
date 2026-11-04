.PHONY: contract contract-check check wheel site public-app

contract:
	cd daemon && poetry run python -c "from muxtower.cli.serve import print_openapi; print_openapi()" > ../openapi.json
	cd app && npm run --silent gen:api
	cd glasses && npm run --silent gen:api

contract-check: contract
	git diff --exit-code -- openapi.json app/src/lib/api/schema.d.ts glasses/src/hub/schema.d.ts

check:
	cd daemon && poetry run ruff check . && poetry run ruff format --check . && poetry run mypy src && poetry run pytest -q
	cd app && npm run lint && npm run typecheck && npm test
	cd glasses && npm run lint && npm run typecheck && npm test
	cd site && npm run check
	$(MAKE) contract-check

wheel:
	cd app && npm ci && npm run build
	cd glasses && npm ci && npm run build
	rm -rf daemon/src/muxtower/web && cp -r app/dist daemon/src/muxtower/web
	cp -r glasses/dist daemon/src/muxtower/web/g2
	cd daemon && poetry build

# The website, with the app's demo build inside: site/dist (site/AGENTS.md).
site:
	cd app && npm ci
	cd site && npm ci && npm run build

# The public hosted copy of the web app (app/deploy/): tagged releases only, and no preset daemons, since
# anyone can load it. Its hostname comes from MUXTOWER_APP_DOMAIN at deploy time (unset: workers.dev).
public-app:
	@git describe --exact-match --tags HEAD >/dev/null 2>&1 || { echo "public-app deploys tagged releases only: check out a vX.Y.Z tag"; exit 1; }
	@test -z "$$MUXTOWER_APP_CONFIG" || { echo "the public app ships no preset daemons: unset MUXTOWER_APP_CONFIG"; exit 1; }
	cd app && npm ci && npm run build
	cd app/deploy && npm ci && npx cf deploy
