# AGENTS.md — site

From the frontend template (dotfiles `projects/claude_templates/AGENTS.frontend.template.md`), filled in for this package.

## Project

`muxtower-site` is the project's one-page website: what muxtower is, a 30-second demo that plays itself, and how to install it. It is aimed at developers who run coding agents on more than one machine. It is static and talks to nothing: no backend, no tokens, no tracking. The demo is drawn by the site (`src/features/demo/`), not the app. `/demo/` also serves the real app's demo build (`../app`, `npm run build:demo`) for visitors who want to click around, and the hero links to it.

## Stack

- Vite + React 19 + TypeScript (strict), prerendered at build time (`src/entry-server.tsx`, `scripts/prerender.mjs`) and hydrated by `src/main.tsx`.
- UI component framework: **shadcn/ui** (style `new-york`, `components.json`), on Radix (`radix-ui`). Add primitives with `npm run ui:add <name>`. The shadcn CLI is pinned as a devDependency.
- Styling: Tailwind CSS v4. Tokens live in `src/styles/site.css` (see below).
- Animation: `motion` (the demo only).
- Forms: none. The page has no input. Add react-hook-form + zod the day it gets one.
- Icons: lucide-react. The GitHub mark is `components/shared/github-mark.tsx`, since the icon set has no brand icons.
- Server state: none. The page fetches nothing. TanStack Query the day it does.
- Client state: local `useState` only. The demo's state is a pure function of its clock (`model/player.ts`), so no store is needed.
- Data contract: none. The site calls no API. The demo's world (`model/world.ts`) is drawn to look like the app, not typed from `openapi.json`, on purpose: it is an illustration, and it is free to simplify.

## Use the framework — never hand-roll Tailwind UI

- Every control is a shadcn component: Button (including its `step` variant for the demo's beats), Tabs, Accordion, Badge, Progress, Separator. No native `<select>`, no hand-styled `<button>`, no home-made tabs or disclosure.
- shadcn's token names are mapped onto the app's tokens in `site.css` (`background`, `foreground`, `primary` = the app's accent, `muted`, `card`, `destructive`, `border`, `input`, `ring`). shadcn's own `accent` (a hover background) is not mapped, because the app's `accent` is its brand blue. The generated components use `muted` for hovers instead, which is the one edit made to them besides `text-danger-fg` for `text-white`. Repeat both edits after `ui:add`.
- A look the framework lacks is a variant in `components/ui/` (for example `button.tsx`'s `step`), never classes at the call site.
- Compositions shared by sections go in `components/shared/`: section, terminal, command pill, fact list, term grid, rich text.
- The demo's phone and desktop window are drawings, not controls. The buttons inside them are shadcn Buttons with `tabIndex={-1}`: nobody operates them, the cursor does.

## Architecture

1. `components/ui/`: shadcn primitives only. The only place a new visual style is defined.
2. `components/shared/`: compositions of primitives used by several sections.
3. `features/demo/`: the self-playing demo.
   - `model/`: the world, the script (steps and beats) and the player (`frameAt(t)`). Pure functions, no React.
   - `hooks/`: the clock and a width measure.
   - `components/`: the stage, desktop window, phone, cursor, hub map and controls.
   - `index.tsx` is its one export, `DemoShow`.
4. `sections/`: one component per band of the page, composed by `app.tsx`. Layout and wiring only.
5. `content/`: all copy, as data, in English. Sections render it and hold no sentences of their own. `code` is written in backticks and rendered by `RichText`.
6. `lib/`: `cn`, clipboard.
7. `config.ts`: build-time settings and the demo build's URL. `MUXTOWER_SITE_REPO`: the GitHub repository (links to it, the README and SECURITY.md are left out when unset). `MUXTOWER_SITE_APP_URL`: the public hosted app (`../app/deploy/`, its own origin); its entry is left out when unset.

No cross-feature imports. Split a file before 250 lines.

### The demo

- The script (`model/script.ts`) is a list of steps, each with a time, what changes in the world, and where the cursor goes. The beats are the titled stretches the controls show, each with one sentence.
- `frameAt(t)` replays the steps from a fresh world, so seeking, looping and server rendering need nothing special.
- The stage is drawn at a fixed size per layout and scaled to its width. `wide` (from 720px) has the desktop window and the phone. `tall` has the phone and a strip of machines. The cursor aims at `data-demo` ids, per layout.
- `model/script.test.tsx` renders every frame the cursor visits and fails if its target is missing. Changing a component's `data-demo` ids without the script shows up there.
- It plays while it is on screen, not before the visitor presses Play when they asked for reduced motion, and loops at the end.
- Every claim it makes must be true of muxtower today. Check `docs/design.md` and the README before scripting a new beat.

## Styling — token discipline

- Colors, type scale and radii come from the app (`../app/src/styles/tokens.css`, imported by `src/styles/site.css`). `site.css` maps shadcn's names onto them and adds what only the site needs: the phone's and window's radii and shadows, the cursor, the glow, the hero's type size.
- The page is light only: `index.html` sets `data-theme="light"`. Terminal transcripts keep the app's dark terminal colors.
- Enforced by `scripts/check-tokens.mjs` (part of `npm run lint`). It forbids raw hex and color functions and Tailwind palette classes outside `site.css`, and arbitrary visual values (`text-[…]`, `rounded-[…]`, …) outside `components/ui/`. Layout utilities, including arbitrary sizes and positions on the demo's fixed stage, are not covered.

## Component decoupling

Composition over props, one job per component. Before writing a styled element in a section, look in `components/shared/`. A pattern used twice goes there.

## Modern React conventions

Function components and hooks. Effects only for the outside world: the animation clock, the IntersectionObserver, the ResizeObserver, measuring the cursor's target. Nothing reads `window` during render, because the page is prerendered and hydrated and both must render the same.

## State management

No server state. Client state is local: the player's clock (`use-player.ts`) and Radix's own state in Tabs and Accordion.

## Testing

- Vitest + React Testing Library + user-event, in jsdom (`src/test/setup.ts` stubs the observers jsdom lacks).
- Every module has a colocated test (`foo.tsx` → `foo.test.tsx`), enforced by `scripts/check-tests.mjs`. Exempt: the entry points, the test harness, and the generated `components/ui/`, which `components/ui/primitives.test.tsx` renders.
- No network to mock: the site fetches nothing.
- Test what a visitor sees and does: text, roles, clicks. For the demo, frames at given times.

## Accessibility, loading, and error states

- Every interactive element has an accessible name. The demo is a labeled region. Its caption is `aria-live`. State and agent marks are labeled images. The cursor is `aria-hidden`.
- Reduced motion: the demo does not start by itself, and smooth scrolling is off.
- No loading or error states: nothing is fetched.

## Data contract

None. The site calls no API (see Stack). If it ever shows live data, it uses `openapi.json`'s generated types like the app.

## Rules

- No personal names, hosts, domains or account handles (root `AGENTS.md`). Examples use `example.com`, `hub.example`.
- English only.
- Plus everything in the template's Forbidden list.

## Setup / Test / Run

- Install: `npm ci` here and in `../app` (the demo build and the tokens come from it).
- Dev server: `npm run dev`. `/demo/` needs a build.
- The one gate, run before every commit and by `make check` in CI: `npm run check`. It runs lint (oxlint and the token check), `prettier --check`, the colocated-test check, `tsc` and the tests.
- Build: `npm run build`. That is the app's demo build at base `/demo/`, plus `build:site`: client build, SSR build, prerender into `dist/index.html`, and `scripts/copy-demo.mjs` copying `../app/dist-demo` into `dist/demo/`.
- Preview: `npm run preview`.
- Deploy: `npm run deploy`, to Cloudflare Workers static assets via the `cf` CLI. The config is in `deploy/`. The project's domain is muxtower.dev: `MUXTOWER_SITE_DOMAIN=muxtower.dev MUXTOWER_SITE_APP_URL=https://app.muxtower.dev npm run deploy` binds it as the Worker's custom domain (unset, only workers.dev), and `scripts/prerender.mjs` writes the link-preview tags (`og:image` = `public/og.png`, 1200×630) for it. `deploy/www/` is a Worker of its own on www.muxtower.dev that only 301s to the apex (`npm ci && npx cf deploy` there). No personal domains or account handles, ever; the workers.dev addresses stay off (a domain bound turns them off).
- Add a primitive: `npm run ui:add <name>`. If the CLI writes it under a literal `@/` folder, move it to `src/components/ui/`. Then make the two token edits above.
