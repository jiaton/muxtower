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
- Demo: `npm run dev:demo` / `npm run build:demo` → `dist-demo/` (the project site embeds it at `/demo/`; build with `MUXTOWER_BASE=/demo/`)
- Deploy: `wrangler.jsonc` (Cloudflare Workers static assets), `.github/workflows/pages.yml` (GitHub Pages)

## Stack

- Vite + React 19 + TypeScript (strict)
- UI primitives: shadcn/ui-style components (Radix + class-variance-authority + tailwind-merge) in `src/components/ui/`, written against our tokens rather than shadcn's color names
- Styling: Tailwind CSS v4; tokens in `src/styles/tokens.css` (`@theme`), light and dark
- Routing: TanStack Router (file routes in `src/routes/`)
- Server state: TanStack Query · Client state: Zustand (persisted) — Zustand only, no Context stores
- Contract: `openapi-typescript` types from `../openapi.json` + `openapi-fetch`
- Terminal: our own view (`features/terminal`): ANSI → HTML lines (`lib/ansi.ts`) in a natively scrolling box, diffed line by line (`features/terminal/lines.ts`); no xterm.js. Non-ASCII text gets exactly the cells tmux gives it (`lib/cell-width.ts`: each wide character a centered 2ch box, other runs their width in `ch`), so columns line up whatever fallback font draws it; ASCII is drawn in the JetBrains Mono the app ships (`src/assets/fonts/`, Regular and Bold, OFL), since a browser with no monospace font draws `monospace` proportionally · PWA/push: `vite-plugin-pwa` (injectManifest, own service worker). App and notification icons: SVG sources (`public/icon.svg`, `scripts/icons/`) rendered to the PNGs in `public/` by `npm run icons` (commit both); Android needs PNGs to install the app and to show its notifications under its own icon

## Architecture (layered — do not collapse)

1. `src/components/ui/` — primitives only. The only place a new visual style is defined.
2. `src/features/<name>/` — `daemons`, `sessions`, `terminal`, `conversation`, `approval`, `push`, `pairing`, `install`, `voice`, `mentions`. Each owns `api/`, `hooks/`, `components/`, and pure logic in `model/` (e.g. `sessions/model/`: how sessions are classified, filtered, grouped, counted, and the list's URL params). No imports into another feature's internals; share through `src/lib/`.
3. `src/routes/` — compose features into pages. Layout and wiring only:
   - `__root.tsx`: the app shell (sidebar from `lg`, bottom tab bar below it, hidden on a phone while a session is open).
   - `_sessions.tsx`: pathless layout holding the session list (validates its URL search params); `_sessions/index.tsx` (`/`) and `_sessions/d.$daemonId.s.$sessionId.tsx` render beside it from `md`, instead of it below.
   - `daemons.tsx`, `pair.tsx`.
4. `src/lib/` — shared by every feature: `daemons/` (the persisted daemon list + `useDaemonClient`, and `useNodes`: the computers joined to a daemon, which the sessions and daemons features both use), `api/` (client factory, generated `schema.d.ts` + `types.ts` aliases, `stream.ts`/`streams.ts`), `runtime-config.ts`, `query.ts`, `agent-state.ts`.
5. `src/sw.ts` — the service worker (own tsconfig: `tsconfig.sw.json`).
6. `src/demo/` — the demo build (`--mode demo`, entry `demo/main.ts` instead of `main.tsx`; no service worker; routes by the URL hash, since a static site serves it as one page). It changes no app code: it answers the app's requests and its `/v1/stream` socket for a made-up daemon address in the page (`server.ts`, `socket.ts`), from a `World` of scripted sessions (`scenes/`: each a session, its screen and conversation, and the steps it plays when approved, denied or messaged). Nothing goes out; every visit starts fresh. Fixtures keep the daemon's real shapes (typed from the schema); a new API field the app needs must be added to `scenes/session.ts`.

Split before 250 lines or once a file mixes two domains.

## Layout and navigation

- Three widths: phone (one pane at a time, bottom tabs; with a session open, its header's menu button opens the list over it as a drawer: `components/ui/drawer.tsx`, the same mounted list, `useSessionDrawer`), `md` (list and session side by side), `lg` (plus the sidebar: views, devices each with its folders, sources, with counts). Panes are `Pane`/`PaneHeader`/`PaneBody` from `components/ui/pane.tsx`: a fixed header (back on phones, title, subtitle, actions) and a body that scrolls on its own.
- What the session list shows (view, device, folder, source, grouping, search) lives in the URL search params of `_sessions`, so back, reload and links keep it; links into a session pass `search={true}` to keep it. The grouping chosen last is the default (`useListPrefs`).
- Leaving a list and coming back lands where the reader was: the list stays mounted beside a session, and `useScrollMemory` restores the position per query when it shows again.
- A page's secondary actions go in its "⋯" menu; features add entries through the menu's `items` slot (e.g. terminal settings into the session menu).
- Sessions are classified only through `sessions/model/facets.ts` (status, device, folder, agent, source); lists, filters and counts never re-derive them. Hierarchy is device → folder → folders inside it: `groupEntries` gives a device group `sections` in tree order (`model/folders.ts`, `nestFolders`: depth, parent, name below the parent), `facetsOf` gives each device its `folders`, and a group's `implies` tells rows what not to repeat.
- Read state, hiding and archiving are the daemon's (`session.unread`, `session.hidden`, `session.archived_at`, shared by all devices): `useSeenWhileOpen` reports the open session as read; `useMarkRead` / `useHideSession` (any daemon, optimistic) and `useArchiveSession` back the actions. Where a session is listed is `placeOf` (listed, hidden, archived; the last two only in their own view, reached from the sidebar or the filter menu, never the tabs); an archived session's page is its conversation, with no input bar.
- `DropdownMenu` is not modal: a dialog opened from a modal menu's item would leave the page unclickable after closing.
- Which agent a session is (Claude Code, Codex…; `agentOf`, from `session.runtime`) is said by shape, never by color: color means state here. `AgentMark` (`sessions/components/agent-mark.tsx`) gives each agent its own glyph; rows show it only while the list holds more than one agent (`agentsDiffer`, like accounts), the session header always names the agent first, and agents are a filter, a grouping, a sidebar section and phone chips only when there is more than one. The New session dialog starts on the agent started last (`useNewSessionPrefs`).
- Where a session is listed under its device is `homeOf` (`model/places.ts`): a project someone set, else its repository from `session.git` (its main folder, holding subfolders and worktrees; `worktreeOf` lists a worktree under it by branch), else its folder; `folderLabel` and the sidebar's folders use it, `nestFolders` takes an explicit parent (`under`) for worktrees, `PlaceIcon` shows the kind.
- Usage: `useMachineUsage` (`lib/daemons/`) reads `/v1/usage` of every paired daemon; a machine over a limit gets a `WarningMark` by its name in the sidebar, the Daemons page lists each one's usage (`UsageList`) and this page's own (`Diagnostics`, from `lib/diagnostics.ts`: frames counted in `stream.ts`, draws in `TerminalView`); nothing shows while all is well.
- Teams: a session's role and project (`session.team_role`, `project`, kept by the daemon, set by agents over MCP or by the owner) show first in its row's meta line and its header's subtitle; its actions offer Team (`TeamDialog`: role, note, project, and the tasks it was sent or sent, `useSessionTasks`).
- A session whose source names no machine is under `NO_ENVIRONMENT` ("No environment"), said as it is; where `capabilities.place`, its actions offer Move (`PlaceDialog`: device and folder, or Detect from its whole log), and the daemon then reports it there (`session.placement`).
- The list's group and folder headers fold what is under them (`useListPrefs.collapsed`, keyed by `foldKey(grouping, group, section)`); a search unfolds everything. The sidebar's device fold (`folded`) is separate.
- A session opened from the list stays in it once it no longer matches (`useOpenedHere` remembers what was opened per query, `model/kept.ts` puts it in a last "Just opened" group). Rows and headers carry `data-flip`, and `useFlip` (`lib/`) slides them when groups change, also after the list was hidden (phones).
- Live mode (`features/voice/live`): hands-free voice into the message box of the session page in front. A local VAD (Silero, `@ricky0123/vad-web`, its model and ONNX Runtime's wasm from a pinned CDN, loaded when Live is first turned on) cuts speech at ~1 s pauses and drops non-speech, short and quiet segments; only those segments go to `/v1/asr?source=live`, and only while listening. `LivePipeline` routes them (short and only a command: send/pause/clear/undo; long and ending in send: appended, then sent; else text), lands them in order, and holds later uploads behind a short segment, so nothing said after "pause" leaves the device; paused, only the on-device spotter listens, for "resume" (or a tap, Alt+L). Spoken commands are heard on the device (`kws.ts`, `kws.worker.ts`: sherpa-onnx KWS via `@sherpaw/kws`, the zh+en 3M model, 13 MB, from a pinned Hugging Face commit into Cache Storage on first use; its WebAssembly from a pinned CDN, rewritten in `vite.config.ts` so it is never bundled; the Worker is terminated when Live is off): a short segment it is sure of acts without upload; else the segment is transcribed with `hint=command` and matched, tolerant of known mishearings (`commands.ts`). The languages listened for are a per-browser choice (Daemons page, English by default); each is a pack of data (`live/packs/<lang>.ts`: the words, how speech to text mishears them, the spotter's tokens), and the code holds no words of its own. The page registers itself as the target (`setLiveTarget`) and the terminal feature's `draftBox` as how its box is written to; `InputBar` registers its Send (`submitters`), so a spoken send is the same send.
- Mentions: `@` in the message box (and in a quote's reply) offers sessions to mention (`features/mentions`: its team, the ones mentioned lately on this browser, every other project folded; typing searches them all) and inserts `@role@project (id)`, parsed back in the same place (`mentionsIn`). The menu is a primitive, `useTokenMenu` (`components/ui/token-menu.tsx`); the session route hands `InputBar` the source as its `mention` slot.
- Quoting: `SelectionAction` (`components/ui`) puts a button under text selected inside an area; the session page uses it on its views to add a quote to the draft (`useDrafts` quotes, `features/terminal/quotes.ts`), which `InputBar` shows inside the message box, above what is typed (`QuoteCards`: a line each, opening to a reply of its own) and sends first, each quote followed by its reply.
- What can be done to a session is defined once, in `SessionActions` (render prop + its dialogs); a list row offers it as a swipe tray (`SwipeActions`) and a hover menu, the session page as its "⋯" menu.
- Sidebar entries mark themselves current from the list's search params (`isCurrentScope`, `data-current`), because the router alone cannot tell while a session is open.
- A session's terminal and conversation are two pages of `Pager` (`components/ui/pager.tsx`: the pages follow a sideways finger and, let go, land in a short slide on the page its distance and speed point to, which is shown and takes taps at once; a swipe right on the first page opens the drawer; an inner scroller that can still scroll sideways takes the swipe). Swipes (`Pager`, `SwipeActions`) share `components/ui/gesture.ts`: a swipe is told from a scroll by its first pixels (up to about 50° off level) and stays one however the finger drifts, and a flick (at least 0.4 px/ms over 40 px; a press held still before it counts too) like a long swipe, while a quicker twitch counts for nothing; a released swipe lands at the finger's speed in 110–190 ms. The drawer (`components/ui/drawer.tsx`) follows a swipe left and closes, leaving a swipe right, or one on a row showing its actions (`data-swipe-open`), to the row.
- The input bar is one row (keys toggle, message box, Send); its text is a per-session draft in `useDrafts` (persisted), cleared once sent; where the conversation is shown, at once instead: the message waits, faded, at the conversation's end until a prompt there has it (`lib/outbox.ts`, `useOutgoing`), says so after a minute without, and goes back into the box if it could not be sent; `KeyPad` opens above it, laid out like a keyboard (arrows as an inverted T, Enter at the right edge). Keys fire on pointer down without taking focus, so the phone keyboard stays as it was.

## Daemons are plural

A daemon can also be a hub: other computers' daemons join it as nodes (`docs/design.md` › Hub and nodes), and their sessions come in its own list, each with `node` set (the New session dialog can start one there; one whose node is away is `offline`, shown dimmed and read only). The Daemons page lists a daemon's nodes and makes the code a computer joins with. Accounts are shown (a row's place line, a filter, a grouping) only when the sessions run as more than one (`accountsDiffer`).

- The daemon list lives in `src/lib/daemons/store.ts` (Zustand, persisted): `{id, name, url, token, preset?, streamAuth?, pushSubscriptionId?}`. Nothing about a daemon is baked into the bundle; defaults come only from the runtime `/config.json`. Selectors that build arrays use `useShallow`.
- Get a client with `useDaemonClient(daemonId)`; never construct `fetch` calls or URLs in components.
- Every query key starts with `['daemon', daemonId, ...]`. The Inbox merges per-daemon queries; it never assumes one daemon.
- One `/v1/stream` socket per daemon, owned by `src/lib/api/streams.ts` (auth order: same-origin cookie, subprotocol, query token), which writes frames into the query cache. Components subscribe with `useStreamSubscription`; they never open sockets. Queries poll only while their daemon's stream is down.
- What a session page offers comes from `session.capabilities` (screen or conversation, accepted keys, resize, rename, terminate), never from `session.source`.
- Features compose through slots, not imports: e.g. `DaemonCard` takes `actions`, and the daemons route passes pairing and push UI into it.

## Styling — token discipline

- Colors, font sizes, radii, shadows only from `src/styles/tokens.css` (`@theme static`, so tokens read from JS exist too). No hex, no `rgb()`/`oklch()`, no Tailwind palette classes (`bg-zinc-900`), no arbitrary visual values (`text-[#fff]`, `rounded-[3px]`), no inline `style` colors. Arbitrary layout values (`max-h-[90dvh]`) and variants (`data-[state=open]:`) are fine. Libraries that need concrete colors (xterm.js) get them from `lib/css-color.ts`, which resolves tokens. Enforced by `npm run check:tokens` (`scripts/check-tokens.mjs`) in lint.
- **Features write layout only.** Outside `src/components/ui/` a class string holds layout (display, flex
  and grid, gap, padding and margin, size, position and inset, overflow, z, alignment, truncate, whitespace)
  and nothing else: no color, type, border, radius, shadow, ring, outline, opacity, decoration, animation or
  transition. Every look comes from `components/ui`: a primitive (Button, Input, Badge, Banner, Card, Chip,
  Spinner, Chevron, Dot, RowToggle, TreeLines, FooterBar…), a variant function (`text`, `box`, `motion`,
  `chip`, `listRow`, `tab`, `composerField`…) or one of the few roles (`textRole`, `surface`, `stateTone`).
  Need a new look? Add a variant (or, rarely, a role) in `components/ui/` first, then use it.
- **No native controls in features**: `<button>`, `<input>`, `<select>`, `<textarea>` and a styled `<a>` are
  Button, Input, Select, Textarea, Checkbox, Switch, FilePicker, TextLink. `Button variant="plain"` wraps
  custom content whose look comes from other primitives; it adds none of its own.
- **Spacing scale.** Gap: 0.5 stacked lines, 1 tight, 1.5 an icon and its label, 2 default, 3 sections, 4 a
  page's blocks. Padding: 0, 0.5, 1, 1.5, 2, 3, 4, 6, and 8 or 10 to indent past an icon. Margin: 0, 0.5, 1,
  1.5, 2, 3, 4, auto. Nothing negative; arbitrary values only for the safe area (`env(...)`). Controls are
  40 px (icon buttons, inputs, a single-line composer, the Live row) or 32 px; bars pad `px-2 sm:px-3`,
  `py-2`. Other steps, and anything a value computed at runtime needs, live inside a primitive.
- Enforced by `check:tokens` (`scripts/check-tokens.mjs`: colors; `scripts/check-styles.mjs`: the three
  rules above, on every class-like string outside `components/ui/` and `lib/ansi.ts`, the terminal's HTML).
  It has no allowlist; a case it cannot express goes into a primitive.
- Not checked, still the rule: don't build a primitive-shaped component in a feature (a chip, a field, a
  toggle line): extend or add the primitive; prefer a variant to a new role; a session state's color is its tone (`stateTone` maps a
  state to it), never a hand-picked one; keep the roles few.
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
