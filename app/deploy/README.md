# The public hosted app

A copy of the real web app on the public internet, for people to pair with their own daemons. It is not
the demo: the website's `/demo/` runs the same code against daemons simulated in the page.

- **Its own origin.** Never under the website's origin (no `/app/` next to `/demo/`): the app keeps
  daemon tokens in localStorage (`muxtower.daemons`), which is per origin, so the site's and the demo's
  scripts would share it, and service-worker scope and push registrations would collide. A Worker's
  `*.workers.dev` address is an origin of its own; a project's `github.io` path is not (every Pages
  project of a user shares that one origin).
- **Tagged releases only.** `make public-app` refuses unless HEAD is exactly a `vX.Y.Z` tag:
  `git worktree add --detach ../muxtower-release vX.Y.Z`, then `make public-app` there with this folder
  present.
- **No preset daemons.** `MUXTOWER_APP_CONFIG` must be unset (the target refuses otherwise):
  `config.json` ships empty, since anyone can load the page.
- **Its host is app.muxtower.dev**: `MUXTOWER_APP_DOMAIN=app.muxtower.dev make public-app`. Unset, the
  Worker stays on its workers.dev address, which carries the account's handle: keep it off (binding a
  domain turns it off).
- **2FA** on every account that can deploy it: the Cloudflare account, and the GitHub account whose
  tags it builds. Whoever can change this Worker's code runs with its users' daemon tokens.

The website links to it when built with `MUXTOWER_SITE_APP_URL`, with the line that the daemon serves the
same app itself.

## On every release, from CI

`.github/workflows/release.yml` deploys it after a tag's PyPI release succeeded (job `public-app`,
`needs: pypi`, so a failed release deploys nothing), by running the same `make public-app` on the tag.
It is opt-in, so a fork's tags deploy nothing unless its owner sets it up:

- **Repository variable** `DEPLOY_PUBLIC_APP` = `true` (Settings › Secrets and variables › Actions ›
  Variables). Unset, the job is skipped.
- **Environment `public-app`** (Settings › Environments), with deployment refs limited to tags `v*`, and:
  - secret `CLOUDFLARE_API_TOKEN`: an API token with only *Account › Workers Scripts › Edit* on the
    account and *Zone › Workers Routes › Edit* on the app's zone;
  - variable `CLOUDFLARE_ACCOUNT_ID`;
  - variable `PUBLIC_APP_DOMAIN`: the custom domain (`app.muxtower.dev` here). Unset, the Worker is
    deployed on its workers.dev address.
  - variable `CLOUDFLARE_WEB_ANALYTICS_TOKEN` (optional): a Cloudflare Web Analytics site's beacon token
    (32 hex; a variable, since the page shows it anyway), passed to the build as
    `MUXTOWER_APP_ANALYTICS_TOKEN`. Set, this build loads Cloudflare's beacon (`src/lib/web-analytics.ts`);
    unset (forks, self-hosters, local builds, the daemon's own copy of the app), it loads none. The app's
    URLs carry daemon and session ids, so before the beacon starts, every report it sends is rewritten:
    the page as its route pattern (`/d/:daemon/s/:session`, no query or hash), a referrer as its origin, ids
    from the page's address cut from every other field, and a report that can't be read is dropped. SPA
    tracking is off (one page view per load). An ad blocker stopping it changes nothing. There is no CSP;
    one added later must allow `https://static.cloudflareinsights.com` (script) and
    `https://cloudflareinsights.com/cdn-cgi/rum` (connect).

The domain never sits in the workflow, so a fork that turns this on deploys to its own. A release that is
already out can be deployed by hand: `MUXTOWER_APP_DOMAIN=… make public-app` from a worktree on its tag.
