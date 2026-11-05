# muxtower

**Approve and drive the coding agents running on your remote machine — from your phone.**

muxtower is server-side and headless. A small daemon runs next to your agents (Claude Code, Codex, …) in tmux, knows which one is waiting on you and for what, and exposes it through a typed HTTP + WebSocket API behind a Bearer token. Put it behind any reverse proxy or tunnel, open the web app on your phone, and approve, answer, or type into any session.

- **Knows what the agent is asking.** Claude Code reports through its own hooks, so a permission request arrives with the exact command. Other agents, and themes muxtower does not know yet, are read off the screen with rules you can edit.
- **Safe by construction.** Approving re-reads the live screen and moves to the chosen option with the arrow keys; nothing is typed blindly. Every device has its own revocable token. Pairing uses one-time codes.
- **Yours to host.** One `pipx install`, and the daemon serves the app itself. No account, no cloud service.

> Status: early development (0.1). Interfaces may change.

## Quick start

```sh
pipx install muxtower
cd ~/code/my-project
muxtower run claude          # starts the daemon if needed, opens Claude Code in a managed tmux session
muxtower pair                # prints a one-time code
```

Open the daemon's address on your phone and enter the code. The daemon cannot know which address your phone uses (LAN, tailnet, tunnel), so it does not guess; once you set `public_url`, `muxtower pair` also shows a QR code you can scan.

For the app to install on the phone and send notifications, the daemon needs an HTTPS address: [your own domain](#your-own-domain-reachable-from-anywhere) behind any reverse proxy or tunnel, or, quickest, [Tailscale](#quickest-tailscale) with one more command, `muxtower expose tailscale`, before `muxtower pair`.

Detach with the usual tmux keys (`Ctrl-b d`); the agent keeps running. Agents you already started in plain tmux are picked up automatically.

## Commands

| | |
|---|---|
| `muxtower` | status: is the daemon running, which sessions need you; sessions a restart interrupted are listed below, to start again (all, some, or not now) |
| `muxtower run AGENT [ARGS…]` | start an agent (`claude`, `codex`, …) in a managed tmux session; `-d` to stay detached, `-n` to name it |
| `muxtower attach [NAME]` | open a session in this terminal (one a restart interrupted is started again first) |
| `muxtower pair` | add a device with a one-time code (and a QR code when the address is known: `--url` or `public_url`). `--revoke NAME` removes one. `--join HUB --code CODE` joins this daemon to another as a node; `--leave` stops |
| `muxtower expose tailscale` | serve the daemon over HTTPS on your tailnet (`tailscale serve`) and set `public_url` to that address; `--off` undoes it |
| `muxtower serve` | run the daemon in the foreground (systemd, Docker). `muxtower run` starts it for you otherwise |

## Reach it from your phone over HTTPS

The daemon listens on `127.0.0.1:8731`. Put HTTPS in front of it: the app needs a secure context to install on the home screen and to receive notifications. Then tell the daemon its address, so pairing codes point there:

```toml
# ~/.config/muxtower/config.toml
public_url = "https://muxtower.example.com"
```

There are two ways to do it. Both are first-class: muxtower brings its own authentication either way, and works behind whatever you already run.

### Quickest: Tailscale

No domain, no open port; only devices on your tailnet can reach the daemon. With Tailscale signed in on this machine and on the phone:

```sh
muxtower expose tailscale     # → https://<machine>.<tailnet>.ts.net, written to the config as public_url
```

It runs `tailscale serve` for you, which keeps serving across restarts. The first time, Tailscale may ask you to turn on HTTPS for the tailnet; on Linux it needs root or `sudo tailscale set --operator=$USER` once.

### Your own domain, reachable from anywhere

Any device with a browser can then use it, with no VPN app. Use what you already have:

- **Caddy** (certificates are automatic):
  ```
  muxtower.example.com {
      reverse_proxy 127.0.0.1:8731
  }
  ```
- **Cloudflare Tunnel** (no open port): a named tunnel with a public hostname pointing at `http://127.0.0.1:8731`. `cloudflared tunnel --url http://127.0.0.1:8731` gives a throwaway address to try it.
- **nginx, Traefik, a load balancer**: any reverse proxy that passes WebSocket upgrades.

On the open internet, muxtower's own authentication is the lock (see [Security model](#security-model)): every device has its own revocable token, pairing codes are single-use, expire in five minutes and are rate-limited, and only a wrong credential answers 401/403, so fail2ban or your WAF can ban whoever is guessing.

**Add your own sign-in in front if you like** (Cloudflare Access, an SSO proxy such as oauth2-proxy or Authelia, a password gate). The gate must let `OPTIONS` requests through unauthenticated. The simplest setup is to sign in to the gate once in each browser: its cookie then covers the app, the API and the WebSocket, and the daemon's own token travels in `Authorization` (which gates usually ignore). If the gate is off-site and nobody has signed in, the app says so and links to the daemon, instead of retrying; it never sends anything a gate would count as a password guess. Nodes reach a hub behind a gate that wants a header of its own through `hub.headers`, and `pairing.mode = "shared"` is for gates that must know every token.

## More than one computer

Run a daemon on each computer, and join them to the one that is always on (the hub): its app then lists, drives and notifies the sessions of every computer, and your phone needs only the hub's address. A joined computer (a node) dials out to the hub, so a laptop needs no address of its own.

```sh
# on the hub: a one-time code (or Daemons › Join a computer in the app, which shows the whole command)
muxtower pair
# on the other computer
pipx install muxtower
muxtower pair --join https://hub.example --code K7QM-3XPA
```

While a node is asleep its sessions stay listed, marked offline. Each daemon reports which account its agents run as; when there is more than one (another Claude account, Claude Code with an API key), the app shows it and can filter and group by it. Remove a node in the app (Daemons). If a gate in front of the hub wants its own header, give it to the node in `[hub] headers`.

Update the hub first. A node that the hub can no longer talk to installs the hub's version from PyPI by itself (with pipx, or pip outside pipx) and starts again on it; a node that is only older is told so, in `muxtower` and on the app's Daemons page. Set `hub.update = "always"` on a node to have it follow every hub update, or `"never"` to only be told.

**When the hub is down.** While the hub's machine restarts, the app reaches the nodes it knows directly, and goes back to the hub once it answers with its nodes linked again ("hub unreachable · direct to …" says so meanwhile). Viewing, approving, sending and interrupting work; push notifications and team changes wait for the hub. For this a node needs an https address of its own that the phone reaches: its `public_url`, or what `tailscale serve` serves it at (found by itself), or one you set for it on the hub's Daemons page. muxtower makes none: Tailscale serve on the node is the simplest; a tunnel on the node (Cloudflare Tunnel, say) does where a VPN is not an option. The hub hands each device an address and a token per node while it answers (revoking the device on the hub revokes those too, on a node that is away once it is back). Not a second hub: nothing is copied between machines.

Claude sessions started outside tmux (the desktop app, an IDE, `claude remote-control`) are listed by the hub's own Remote Control, as that computer's when their process runs on a node: the node says which run there, from Claude Code's own files, with no login of its own. A node signed in to another Claude account lists that account's sessions itself: turn `remote_control.enabled` on for it (on macOS it reads the Claude login from the Keychain, as Claude Code does).

## The web app

**Recommended: the one the daemon serves.** Open your daemon's URL; it offers to pair with itself. Same origin as the API, so nothing to configure.

**One app for several daemons, on your own hosting.** The app is a static site; the daemons it talks to are added on each device by pairing, and stay in that browser.

- *Cloudflare Workers*: fork this repository, then in the Cloudflare dashboard **Workers & Pages → Create → Import a repository**, root directory `app`, build command `npm run build`, deploy command `npx wrangler deploy`.
- *GitHub Pages*: fork, set **Settings → Pages → Source** to *GitHub Actions*, add the repository variable `DEPLOY_PAGES=true`, and run the `pages` workflow.

**A public hosted copy.** [app.muxtower.dev](https://app.muxtower.dev) is a copy of the app hosted on its own origin (built only from tagged releases: `make public-app`, `app/deploy/`), to use without hosting one. Your pairings stay in your browser, and the host never sees your traffic (the app talks to your daemons directly), but the code it serves runs with your tokens: if that host were compromised, so would be the daemons paired there. The one your daemon serves comes first, your own hosting second; use the public copy knowing that. Pairing from a hosted app (this one or your own) needs the daemon on https: an https page cannot reach a plain-HTTP address (Tailscale serve via `muxtower expose tailscale`, or your own proxy or tunnel); on plain HTTP, open the daemon's own page and pair there. The only official domains are muxtower.dev and app.muxtower.dev; anything else asking for your daemon address or a pairing code is not us.

Daemons accept requests from any origin by default. That is safe because every request needs a token and no cookies are involved, but it lets any app origin you paired from use your tokens. To trust only the app origins you choose, list them in `cors.allowed_origins`: your daemon's own origin is always allowed, so name the others, such as your self-hosted app (a node also allows its hub's, for when the hub is down):

```toml
[cors]
allowed_origins = ["https://muxtower-app.example.com"]
```

**Where the app keeps daemons.** The daemons a browser paired with (address, name, token, push subscription) are in that browser's localStorage (`muxtower.daemons`), per browser and per origin; a daemon keeps only each token's hash. So:

- the app a daemon serves and one you host yourself have separate lists;
- each browser and device pairs on its own: no sync and no account, by design;
- on iOS, Safari and an app added to the Home Screen do not share storage: pair again in the added app;
- clearing the site's data (or the browser evicting it) means pairing again; the daemons are not affected;
- any script on that origin can read the tokens, which is why preset tokens need a gate (below);
- the nodes a hub hands over for when it is down are kept in the same list, with the same limits; after a wipe the hub hands them over again once it answers.

**Preset daemon addresses (recommended for a self-hosted app).** A deployment can ship a default daemon list in `config.json`, generated at build time from the `MUXTOWER_APP_CONFIG` build variable or secret. With addresses only, a new browser or device already lists your daemons and you only enter a pairing code; that is safe without a gate, since a code is still needed:

```json
{ "daemons": [
  { "name": "hub", "url": "https://hub.example.com" },
  { "name": "laptop", "url": "https://laptop.example.ts.net" }
] }
```

An app hosted away from the hub's machine (Workers, Pages) also still loads while that machine and its way in are down, which the cached app cannot promise to a new device or after the cache was cleared (then open a node's own address: every daemon serves the same app).

Adding `"token"` to an entry skips pairing entirely, but anyone who can load the site can then read that token. The build refuses unless you also set `"acknowledge_public_tokens": true`, and the app shows a warning. The trade-off: the gate's login becomes the only barrier (anyone past it controls those daemons), and revoking means rebuilding and deploying again. Only do this behind a gate you trust, such as Cloudflare Access, your own SSO or a password gate. A gate in front of the static app is a good extra layer either way.

**Session names.** A name you give a session in muxtower (when starting it, or by renaming it) stays: a title Claude makes up, or one claude.ai regenerates for a Remote Control session, does not replace it. Renamed in the Claude app, a session shows that name once muxtower sees it change; to be sure, rename it in muxtower too. A session you never named goes by its agent's own name.

**Moving to another device.** On a paired phone, *Daemons → Add another device* shows one QR code that pairs the other device with every daemon at once. It carries one-time codes, not tokens: each device gets its own token, and the QR stops working after one use or five minutes.

## On Even Realities G2 glasses

The daemon also serves a glasses app at `/g2/` (`glasses/`, an Even Hub app): what needs you first, then each machine's sessions; approve with two taps; long replies as a short summary first (`summaries.provider`); answer by voice, holding or tap-to-tap with the text appearing as you speak (`asr.provider`). Open it with the Even App's developer mode (`npx -p @evenrealities/evenhub-cli evenhub qr --url https://<daemon>/g2/`) and pair it with a code from `muxtower pair`. Details: `glasses/AGENTS.md`, `docs/g2.md`.

## The assistant and MCP

The stream (`/v1/stream`) can send a screen as patches on the one before (`encoding: "lines"`, `docs/design.md` › Screens as patches); a client of your own can ignore that and gets whole screens.

`/v1/mcp` offers muxtower's sessions as MCP tools (list, read, message, approve, deny, interrupt, start, watch) to any MCP client with a device token, e.g. `claude mcp add --transport http muxtower https://<daemon>/v1/mcp --header "Authorization: Bearer <token>"`. With `concierge.enabled`, muxtower keeps its own Claude Code session wired to these tools: talk to it (from the glasses, the apps, or Remote Control) and it relays to, reports on and answers for your other sessions.

## Permission modes

muxtower adds no permission flag of its own: a session asks you, or not, as its agent's own settings say (Claude Code's `defaultMode` in `~/.claude/settings.json`, Codex's `config.toml`). To start one otherwise, pick its **Permission mode** in the New session dialog (each runtime lists its own: plan, ask, accept edits, auto, bypass for Claude Code; untrusted, on request, full auto, full access for Codex), or set a default per runtime, with extra arguments, in the app's Settings (*New sessions*) or the config file:

```toml
[launch]
claude_code_mode = "acceptEdits"   # or "agent": its own settings decide
claude_code_args = ["--model", "opus"]
```

The mode is kept when a session is started again after a restart. An agent starting a session over MCP (`start_session`) can ask for a mode only up to that default, and never bypass or full access, unless you turn `launch.agents_may_escalate` on. In an asking mode, team members stop at every permission prompt and tasks sent to them wait meanwhile: turn on auto-approve for such a session, or start it in auto or accept-edits mode.

## Agents and screen rules

| agent | state from | approve from the phone |
|---|---|---|
| Claude Code | hooks (exact tool and command) + screen rules | yes |
| Codex | hooks (exact tool and command, questions) + screen rules; also Codex's own app-server (see below) | yes |
| OpenCode | none yet: terminal and input only | add screen rules |

For Claude Code, `muxtower run claude` passes `--settings` with HTTP hooks pointing at the daemon; nothing is written to your own `settings.json`. For Codex it passes the same hooks on the command line (`-c hooks=…`, trusted for that session only); nothing is written to `~/.codex`.

**Codex without a terminal.** Codex keeps an app-server for the Codex clients on a machine (`codex` in a terminal, the desktop app, editors). With `codex.shared = true` muxtower joins it as one more client: every thread it has loaded is listed, with its conversation, its approvals and questions answered from the phone, and messages sent to it, as Remote Control does for Claude Code. A `codex` in tmux that runs there is listed once, as its tmux session. A request Codex made before muxtower looked is only flagged ("waiting where it runs"); muxtower never starts that app-server and never archives its threads. With `codex.headless = true` muxtower also runs an app-server of its own for threads started from the app's New session dialog (no tmux).

Screen rules are plain TOML. Copy the shipped file to change it, for example after an agent update or with a custom theme:

```sh
mkdir -p ~/.config/muxtower/runtimes
python -c "import muxtower, pathlib; print(pathlib.Path(muxtower.__file__).parent / 'runtimes/defaults/claude-code.toml')"
```

A file in `~/.config/muxtower/runtimes/` replaces the shipped one with the same name; a new file adds an agent. Each rule maps a regex to a state (`needs_permission`, `needs_answer`, `needs_trust`, `plan_review`, `error`, `busy`, `idle`). The `[menu]` section sets the cursor glyph that marks the highlighted choice, and `[approve.prefer]` sets which choice "approve" picks. The session page shows which rule matched.

Sessions that muxtower did not start (found in your own tmux) can be watched, answered and approved, but never killed.

## Configuration

`~/.config/muxtower/config.toml`. Every key can also be set with an environment variable, and the common ones with `muxtower serve` flags.

| key | env | default | |
|---|---|---|---|
| `name` | `MUXTOWER_NAME` | hostname | how the daemon appears in the app |
| `host` / `port` | `MUXTOWER_HOST` / `MUXTOWER_PORT` | `127.0.0.1` / `8731` | listen address |
| `public_url` | `MUXTOWER_PUBLIC_URL` | — | the HTTPS address devices use |
| `push_contact` | `MUXTOWER_PUSH_CONTACT` | `public_url` | who push services may contact about this daemon's notifications (`mailto:` or `https://`); iPhones get no notifications without one or an HTTPS `public_url` |
| `cors.allowed_origins` | `MUXTOWER_CORS_ALLOWED_ORIGINS` | `["*"]` | restrict which app origins may call the API |
| `adopt_sockets` | `MUXTOWER_ADOPT_SOCKETS` | `["default"]` | other tmux servers to scan for agents |
| `tmux_socket` | `MUXTOWER_TMUX_SOCKET` | `muxtower` | tmux server for sessions muxtower starts |
| `pairing.mode` | `MUXTOWER_PAIRING_MODE` | `device` | `shared`: every pairing hands out `pairing.shared_token` (for gates that must know each token) |
| `trusted_proxies` | `MUXTOWER_TRUSTED_PROXIES` | loopback | CIDRs of reverse proxies whose `X-Forwarded-For` is believed (for per-client rate limits) |
| `state_dir` | `MUXTOWER_STATE_DIR` | `~/.local/state/muxtower` | database, keys |
| `serve_ui` | `MUXTOWER_SERVE_UI` | `true` | serve the web app at `/` (and the glasses app at `/g2/`) |
| `cors.extra_headers` | — | `[]` | extra request headers apps may send, e.g. a gate's own credential header |
| `launch.<runtime>_mode` / `_args` | — | `"agent"` / `[]` | how new sessions start (permission mode, extra arguments): *Permission modes* above |
| `remote_control.enabled` | `MUXTOWER_REMOTE_CONTROL_ENABLED` | `false` | also list the Claude Code Remote Control sessions of the Claude account logged in here (private API; may break) |
| `remote_control.environments` | — | `{}` | `environment_id` → machine name to show (the API has no names) |
| `codex.shared` | — | `false` | also list, answer and message the threads of the Codex app-server this machine's Codex clients share |
| `codex.headless` | — | `false` | run Codex threads in an app-server of muxtower's own, started from the New session dialog |
| `codex.sandbox` / `.approval_policy` / `.model` | — | `workspace-write` / `on-request` / Codex's | how a headless thread runs (`danger-full-access` where Codex's sandbox cannot start, e.g. a container without user namespaces) |
| `summaries.provider` | `MUXTOWER_SUMMARIES_PROVIDER` | `off` | `claude-code` (`claude -p`) or `codex` (`codex exec`), using that CLI's login on this machine, makes short versions of long replies |
| `summaries.min_chars` / `summaries.eager` | — | `400` / `true` | replies longer than this get a summary; eager: as soon as a session needs you |
| `asr.provider` | `MUXTOWER_ASR_PROVIDER` | `off` | `groq` or `openai`: speech to text for voice replies (the glasses, and the app's microphone button) |
| `asr.api_key_file` / `asr.api_key` | `MUXTOWER_ASR_API_KEY` | — | the provider's key (keep it in a 0600 file) |
| `asr.language` / `asr.prompt` | — | detect / — | pin the language, e.g. `zh`; extra words for the recognizer (session names and common terms are always given) |
| `concierge.enabled` | `MUXTOWER_CONCIERGE_ENABLED` | `false` | keep an assistant session running that you talk to instead of each session (see below) |
| `concierge.model` / `.name` / `.cwd` | — | `sonnet` / `Assistant` / `~` | its model, display name and working directory |
| `concierge.remote_control` / `.args` | — | `true` / `[]` | also reachable from the Claude apps; extra `claude` arguments |
| `hub.headers` | — | `{}` | as a node: headers sent with every request to the hub, for a gate in front of it |
| `hub.update` | — | `incompatible` | as a node: install the hub's version from PyPI and restart on it when the hub no longer speaks this one's protocol (`incompatible`), whenever the hub runs a later one (`always`), or never |

Run it as a service:

```ini
# ~/.config/systemd/user/muxtower.service
[Unit]
Description=muxtower

[Service]
ExecStart=%h/.local/bin/muxtower serve
Restart=on-failure

[Install]
WantedBy=default.target
```

```sh
systemctl --user enable --now muxtower && loginctl enable-linger "$USER"
```

## Security model

- One daemon has one owner. Each paired device holds its own token, stored hashed on the daemon. Revoke a device from the app or with `muxtower pair --revoke`.
- Pairing codes are single-use, expire after five minutes, and are rate-limited. They travel in the URL fragment, which browsers never send to a server.
- The web app's WebSocket authenticates with an HttpOnly cookie when it is served by the daemon itself. Otherwise it sends the token as a WebSocket subprotocol, and falls back to `?access_token=` only for proxies that pass nothing else (never `?token=`, which gates treat as a guess). Every socket is preceded by one plain request, so a revoked token or a gate costs one refused request, not a burst. Access logs redact `access_token=`.
- The API never runs shell strings. It starts only the binaries defined by runtime files, and approval keys are sent only after the live screen shows the dialog.
- Only a wrong credential (a bad token, a wrong pairing code, a refused WebSocket) answers 401 or 403, so a log watcher such as fail2ban can count those as guessing. Ordinary refusals use 400/409/429, and the app stops calling a daemon that rejected its token instead of retrying.
- A node joins its hub with a pairing code and gets a token of its own, which opens its link and nothing else: it cannot use the hub's API. The hub can do on a node what a paired device can do there, so join only your own computers.
- Every action (input, approve, deny, create, terminate, pair, revoke) is written to an audit log with the device name. Typed text is never logged.

## How it compares

- [claude-squad](https://github.com/smtg-ai/claude-squad) is a terminal UI for running many agents on your own machine. muxtower has no TUI; it is a daemon and API for reaching agents remotely.
- [TmuxDeck](https://github.com/ctliz/TmuxDeck) is the closest idea: find the tmux pane that needs a human. It is a desktop app with a LAN-only mobile page. muxtower is headless and API-first, and built to sit behind a proxy on the open internet.
- ttyd and gotty are browser terminals. muxtower shows terminals too, but its point is knowing what each agent is waiting for.

## Development

`daemon/` holds the Python package, `app/` the web app, and `docs/design.md` the architecture. Run `make check` for everything CI runs, `make contract` after an API change, and `make wheel` to build the package with the app inside. See `AGENTS.md`.

## License

Apache-2.0
