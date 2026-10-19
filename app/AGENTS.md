# AGENTS.md — app

`muxtower-app`: a PWA for phones and desktops that connects to one or more muxtower daemons. Shows every agent session waiting on a human across all daemons (Inbox), a live terminal (or, for sessions without a screen, the structured conversation) per session with approve/deny/option buttons and an input bar, and Web Push when an agent needs attention. Talks only to daemon `/v1` APIs. Served by the daemon at `/` (recommended) or hosted separately as static files.

## Setup / Test / Run

- Install: `npm ci`
- Dev server: `npm run dev` (proxies `/v1` to `http://127.0.0.1:8731`, so a dev daemon is same-origin)
- Tests: `npm test` (Vitest) · E2E: `npm run e2e` (Playwright)
- Lint/typecheck: `npm run lint && npm run typecheck` (includes `npm run check:tokens`)
- Regenerate API types: `npm run gen:api` (reads `../openapi.json`)
- Route tree: `npm run routes` (also run by build/typecheck; `src/routeTree.gen.ts` is committed)
- Build: `npm run build` → `dist/` (`MUXTOWER_BASE=/sub/path/` for sub-path hosting; `MUXTOWER_APP_CONFIG` writes `dist/config.json`)
- Deploy: `wrangler.jsonc` (Cloudflare Workers static assets), `.github/workflows/pages.yml` (GitHub Pages)

## Stack

- Vite + React 19 + TypeScript (strict)
- UI primitives: shadcn/ui-style components (Radix + class-variance-authority + tailwind-merge) in `src/components/ui/`, written against our tokens rather than shadcn's color names
- Styling: Tailwind CSS v4; tokens in `src/styles/tokens.css` (`@theme`), light and dark
- Routing: TanStack Router (file routes in `src/routes/`)
- Server state: TanStack Query · Client state: Zustand (persisted) — Zustand only, no Context stores
- Contract: `openapi-typescript` types from `../openapi.json` + `openapi-fetch`
- Terminal: our own view (`features/terminal`): ANSI → HTML lines (`lib/ansi.ts`) in a natively scrolling box, diffed line by line (`features/terminal/lines.ts`); no xterm.js · PWA/push: `vite-plugin-pwa` (injectManifest, own service worker)

## Architecture (layered — do not collapse)

1. `src/components/ui/` — primitives only. The only place a new visual style is defined.
2. `src/features/<name>/` — `daemons`, `sessions`, `terminal`, `conversation`, `approval`, `push`, `pairing`. Each owns `api/`, `hooks/`, `components/`, `types.ts`. No imports into another feature's internals; share through `src/lib/`.
3. `src/routes/` — compose features into pages: `/` (Inbox), `/d/$daemonId/s/$sessionId`, `/daemons`, `/pair`. Layout and wiring only.
4. `src/lib/` — shared by every feature: `daemons/` (the persisted daemon list + `useDaemonClient`), `api/` (client factory, generated `schema.d.ts` + `types.ts` aliases, `stream.ts`/`streams.ts`), `runtime-config.ts`, `query.ts`, `agent-state.ts`.
5. `src/sw.ts` — the service worker (own tsconfig: `tsconfig.sw.json`).

Split before 250 lines or once a file mixes two domains.

## Daemons are plural

- The daemon list lives in `src/lib/daemons/store.ts` (Zustand, persisted): `{id, name, url, token, preset?, streamAuth?, pushSubscriptionId?}`. Nothing about a daemon is baked into the bundle; defaults come only from the runtime `/config.json`. Selectors that build arrays use `useShallow`.
- Get a client with `useDaemonClient(daemonId)`; never construct `fetch` calls or URLs in components.
- Every query key starts with `['daemon', daemonId, ...]`. The Inbox merges per-daemon queries; it never assumes one daemon.
- One `/v1/stream` socket per daemon, owned by `src/lib/api/streams.ts` (auth order: same-origin cookie, subprotocol, query token), which writes frames into the query cache. Components subscribe with `useStreamSubscription`; they never open sockets. Queries poll only while their daemon's stream is down.
- What a session page offers comes from `session.capabilities` (screen or conversation, accepted keys, resize, rename, terminate), never from `session.source`.
- Features compose through slots, not imports: e.g. `DaemonCard` takes `actions`, and the daemons route passes pairing and push UI into it.

## Styling — token discipline

- Colors, font sizes, radii, shadows only from `src/styles/tokens.css` (`@theme static`, so tokens read from JS exist too). No hex, no `rgb()`/`oklch()`, no Tailwind palette classes (`bg-zinc-900`), no arbitrary visual values (`text-[#fff]`, `rounded-[3px]`), no inline `style` colors. Arbitrary layout values (`max-h-[90dvh]`) and variants (`data-[state=open]:`) are fine. Libraries that need concrete colors (xterm.js) get them from `lib/css-color.ts`, which resolves tokens. Enforced by `npm run check:tokens` (`scripts/check-tokens.mjs`) in lint.
- Layout utilities (`flex`, `gap-2`, `p-4`) are fine anywhere.
- Need a new color? Add the token (both themes) first.
- Agent state colors are tokens too (`--color-state-permission`, `--color-state-question`, `--color-state-busy`, ...).

## Component decoupling / React

- Composition over prop lists; one responsibility per component; check `components/ui/` before styling something new.
- Function components and hooks only. Hooks named `use-kebab-case.ts`.
- `useEffect` only to sync with external systems (the terminal DOM, service worker, socket); never to fetch or derive state.
- No prop drilling past two levels.

## State management

- Server state through TanStack Query, one hook per resource inside its feature. Mutations invalidate or patch the right `['daemon', id, ...]` keys.
- Client state (daemon list, UI prefs) in Zustand; local `useState` first.
- Server data never goes into Zustand.

## Accessibility, loading, error states

- Every interactive element has an accessible name; icon buttons get `aria-label`.
- Query loading/error/empty go through `src/components/query-state.tsx`; a disabled query is not "loading".
- A daemon that is unreachable or rejects its token shows a per-daemon banner, not a global failure.

## Testing

- Vitest + React Testing Library; network mocked with MSW at the HTTP boundary (`src/test/handlers.ts`), generated from the same schema types.
- Every `features/*/api` hook has a test; every `components/ui` primitive has a render test before a second feature uses it.
- Playwright E2E in `e2e/` against a dev daemon with a fake runtime.

## Forbidden

- Raw colors or palette classes outside `tokens.css`; arbitrary Tailwind values.
- New visual primitives outside `components/ui/`.
- Cross-feature internal imports.
- Hand-written API types or URLs; anything not going through the generated client.
- Hand-rolled `useEffect` + `useState` fetching.
- A second state library or Context store for client state.
- Any URL, token or hostname baked into the bundle or `.env` files committed with values.
- UI strings in any language but English.
- Personal names, hosts or predecessor-project references (see root `AGENTS.md`).
