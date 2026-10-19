# AGENTS.md — glasses

`muxtower-g2`: muxtower on Even Realities G2 glasses, an Even Hub app. A web page that runs in the Even App's WebView on the phone, draws on the glasses through `@evenrealities/even_hub_sdk`, and shows its own page (the phone panel) in the Even App. Talks only to one hub's `/v1` API. Interaction design and the reasons behind it: `../docs/g2.md`.

## Setup / Test / Run

- Install: `npm ci`
- Dev server: `npm run dev` (proxies `/v1` to `MUXTOWER_DEV_DAEMON`, default `http://127.0.0.1:8731`, so the hub is same-origin as when it serves `/g2/`). In a plain browser the page drives preview glasses (buttons; arrows, Enter, Backspace).
- Simulator: `evenhub-simulator http://127.0.0.1:5173/ --automation-port 9898` (`@evenrealities/evenhub-simulator`; on a headless Linux box under `xvfb-run`, needs WebKitGTK 4.1). Its panel cannot be typed into: start the dev server with `MUXTOWER_G2_DEV_TOKEN=<device token>` (dev server only; builds never contain it). Pair a test device under its own name (`e2e-…`) and revoke it by that name afterwards.
- On a phone: the hub serves this build at `/g2/` (`make wheel` bundles it). In the Even App's developer mode, `npx evenhub qr --url https://<hub>/g2/`.
- Packaged (`.ehpk`): `MUXTOWER_G2_CONFIG='{"hub":"https://<hub>"}' npm run pack`; app.json's network whitelist is filled with the hub's origin. A gate in front needs its credential in `gate.headers` (HTTP) and `gate.query` (the WebSocket), and the header listed in the hub's `cors.extra_headers`.
- Tests: `npm test` (Vitest) · Lint/typecheck: `npm run lint && npm run typecheck` (lint includes `scripts/check-limits.mjs`)
- API types: `npm run gen:api` (from `../openapi.json`; `make contract` at the root does it)

## Stack

- Vite + TypeScript (strict), no UI framework: the glasses are SDK containers, not DOM, and the panel is a small DOM page.
- Font metrics: `@evenrealities/pretext` (the firmware font's widths, kerning and CJK) for every cut, column and line break.
- State: `zustand/vanilla`, one store. Server state is the session list the stream pushes (polled while the stream is down); there are no per-resource queries yet, so there is no query library.
- Contract: `openapi-typescript` types + `openapi-fetch`, the same generation as the web app.

## Architecture (layered — do not collapse)

A layer imports only from layers above it in this list.

1. `src/platform/` — `GlassesPort`, the only boundary to the SDK (`even.ts`) and its browser stand-in (`preview.ts`). Nothing else imports the SDK, except `input/gestures.ts` for event types.
2. `src/display/` — the screen primitives (the web app's `components/ui/`): `limits.ts` (display and container limits, the "tokens"), `text.ts` (fit, pad, columns, wrap, glyph stand-ins), `screen.ts` (`Screen` → container text within the byte budget), `renderer.ts` (create once, then update text only; latest screen wins, unchanged screens skipped).
3. `src/input/` — raw events → gestures → actions through a remappable `GestureMap`. Screens only see actions.
4. `src/hub/` — config, typed client, pairing, the stream; `types.ts` aliases the generated schema.
5. `src/state/` — the app state and navigation (`model.ts`), the launch rule, persistence (through the port's storage).
6. `src/screens/` — pure functions per screen: `view(state, now) → Screen` and `act(state, action) → Outcome {nav, notice?, command?}`. No I/O, no timers, no SDK; everything is unit-tested.
7. `src/voice/` — `talk.ts` (a voice reply: hold or tap-to-tap, live text, final pass, confirm), `recorder.ts` (the microphone, 60 s cap), `segmenter.ts` (cuts at pauses for live text), `wav.ts`.
8. `src/commands.ts` runs a screen's command against the hub; `src/app.ts` is the controller wiring everything; `src/panel/` is the phone panel; `src/main.ts` picks the port.

Split a file past 250 lines or once it mixes two layers.

## Display rules

- One full-screen text container that captures input; the page is created once (rebuilt if it already exists) and afterwards only its text is replaced, so nothing flickers. The system menu is fixed for the page (`screens/index.ts` `MENU`).
- Raw display numbers (576, 288, byte limits) live only in `display/limits.ts`; `check-limits.mjs` fails on them elsewhere and on menu items over the firmware's limits.
- Every line is measured with the firmware metrics; text that does not fit is cut with an ellipsis, never left to the firmware. Glyphs the font lacks are replaced or removed before drawing (the firmware drops them silently).
- Lists are our own cursor lists in text (the SDK list cannot start on a chosen row): the cursor follows a row id, the order is frozen while a screen is shown (new rows appended with `•`), each screen's cursor is kept and saved.
- Choosing an option takes two taps (choose, confirm); any other gesture disarms.
- The assistant (`role: "concierge"`) is pinned first on Home and kept out of the waiting list and the groups; holding outside a session talks to it.
- A voice reply is never sent without a tap on the transcript. Talking starts by holding, or by a tap where a tap means nothing else (a session while reading, the menu's Talk); the next tap stops it, a double tap cancels. Long replies show the hub's summary first (`reply_summary`, asked for when a session is opened), the full text after a marker.
- UI strings in English; content (session names, replies) as the agents wrote it, often Chinese.

## Events (verified in the simulator)

- Swipes reach a text container as `textEvent` with type 1 (up) / 2 (down), even when nothing overflows.
- A tap is a `sysEvent` with no type (0 is left out by the encoding): no type means a tap.
- Types 4 / 5 mean a system layer (the menu) covered / uncovered the app; on uncover the app reconnects and redraws.

## Auth

- The device token comes from a one-time pairing code (`POST /v1/pair/claim`) and is kept in the Even App's storage for this app. The WebSocket authenticates with the `bearer.<token>` subprotocol, never a URL token.
- No tokens, keys or hub addresses in the source. A packaged build's `config.json` is written at build time and never committed.

## Testing

- Vitest on the pure layers (display, input, screens, state). `src/test/fixtures.ts` builds sessions and states.
- Before calling a change done: run it in the simulator against a hub and look at the screenshots (`/api/screenshot/glasses`). Never approve anything in a real session while testing; use a throwaway daemon with its own tmux socket.

## Forbidden

- Importing the SDK outside `platform/` (and gesture event types in `input/`).
- I/O, timers or `Date.now()` inside `screens/`.
- Raw display numbers outside `display/limits.ts`; drawing text that was not measured.
- Tokens, keys or hub addresses in the source or in committed files.
- Personal names, hosts or predecessor-project references (see root `AGENTS.md`).
