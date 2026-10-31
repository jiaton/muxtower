# AGENTS.md — site

`muxtower-site`: the project's one-page website, with the real app running in a phone frame against a simulated daemon (the app's demo build). Static: no backend, no tokens, no tracking.

## Setup / Build / Run

- Install: `npm ci`
- Dev server: `npm run dev` (the demo frame needs a build: see below)
- Lint/typecheck: `npm run lint && npm run typecheck` (lint includes `scripts/check-tokens.mjs`)
- Build: `npm run build` = the app's demo build (`npm run build:demo` in `../app`, base `/demo/`) + `npm run build:site`: client build, SSR build of `src/entry-server.tsx`, `scripts/prerender.mjs` (the page's HTML into `dist/index.html`), `scripts/copy-demo.mjs` (`../app/dist-demo` → `dist/demo/`; a placeholder when it is missing)
- Preview: `npm run preview`. Deploy: `wrangler.jsonc` (Cloudflare Workers static assets); the hostname is set in the dashboard, never in the repo.
- Build-time settings: `MUXTOWER_SITE_REPO` (the GitHub repository URL; links to it, the README and SECURITY.md are left out when unset). Read only in `src/config.ts`.

## Stack

Vite + React 19 + TypeScript (strict) + Tailwind CSS v4, like the app. No router, no state library: one page, local `useState`. Icons: lucide-react (no brand icons; the GitHub mark is `components/ui/icons.tsx`).

## Layout

- `src/app.tsx` composes the page from `src/sections/` (one component per band: header, hero, demo, how-it-works, get-started, features, security, faq, footer).
- `src/components/ui/` — primitives (button, code/copy, tabs, phone frame, section, card, rich text). The only place a new visual style is defined.
- `src/content/` — all copy, as data (English only). Sections render it; they do not hold sentences of their own. `code` spans are written in backticks and rendered by `RichText`.
- `src/config.ts` — build-time settings and the demo's URLs (`demoPage`: the demo routes by the URL's hash, `demo/#/d/demo/s/<session>`).
- `src/main.tsx` hydrates the prerendered HTML (renders from scratch on the dev server); `src/entry-server.tsx` renders it at build time. Anything rendered must be the same on both: no `window` during render.

## Rules

- Tokens come from the app (`../app/src/styles/tokens.css`, imported by `src/styles/site.css`): the same discipline as `app/AGENTS.md` (no raw colors, palette classes or arbitrary visual values). A site-only token (the phone's radius and shadow) goes in `site.css`'s `@theme`. Theme: `index.html` sets `data-theme` from the system's color scheme before the first paint.
- The phone frame shows the demo build only; never a live daemon.
- Every interactive element has an accessible name; tabs are a real tablist (arrows, Home/End); the FAQ is native `<details>`.
- Split before 250 lines. No personal names, hosts, domains or account handles (root `AGENTS.md`).
