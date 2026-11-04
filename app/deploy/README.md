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
- **The hostname is the deployment's.** Unset `MUXTOWER_APP_DOMAIN` keeps the Worker on workers.dev;
  set, it binds that custom domain. Never in the repository.
- **2FA** on every account that can deploy it: the Cloudflare account, and the GitHub account whose
  tags it builds. Whoever can change this Worker's code runs with its users' daemon tokens.

The website links to it when built with `MUXTOWER_SITE_APP_URL`, with the line that the daemon serves the
same app itself.
