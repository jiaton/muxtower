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

Detach with the usual tmux keys (`Ctrl-b d`); the agent keeps running. Agents you already started in plain tmux are picked up automatically.

## Commands

| | |
|---|---|
| `muxtower` | status: is the daemon running, which sessions need you |
| `muxtower run AGENT [ARGS…]` | start an agent (`claude`, `codex`, …) in a managed tmux session; `-d` to stay detached, `-n` to name it |
| `muxtower attach [NAME]` | open a session in this terminal |
| `muxtower pair` | add a device with a one-time code (and a QR code when the address is known: `--url` or `public_url`). `--revoke NAME` removes one. `--join HUB --code CODE` joins this daemon to another as a node; `--leave` stops |
| `muxtower serve` | run the daemon in the foreground (systemd, Docker). `muxtower run` starts it for you otherwise |

## Reach it from your phone over HTTPS

The daemon listens on `127.0.0.1:8731`. Put HTTPS in front of it: the app needs a secure context to install on the home screen and to receive notifications. Then tell the daemon its address, so pairing codes point there:

```toml
# ~/.config/muxtower/config.toml
public_url = "https://muxtower.example.com"
```

Pick one:

1. **Tailscale** (simplest for personal use; no domain, no open port):
   ```sh
   tailscale serve --bg 8731     # → https://<machine>.<tailnet>.ts.net
   ```
2. **Cloudflare Tunnel** (reachable from anywhere, no open port):
   ```sh
   cloudflared tunnel --url http://127.0.0.1:8731      # quick try; use a named tunnel for a stable hostname
   ```
3. **Caddy** (your own domain; certificates are automatic):
   ```
   muxtower.example.com {
       reverse_proxy 127.0.0.1:8731
   }
   ```

Any gate in front (Cloudflare Access, an SSO proxy, a password gate) must let `OPTIONS` requests through unauthenticated. The simplest setup is to sign in to the gate once in each browser: its cookie then covers the app, the API and the WebSocket, and the daemon's own token travels in `Authorization` (which gates usually ignore). If the gate is off-site and nobody has signed in, the app says so and links to the daemon, instead of retrying; it never sends anything a gate would count as a password guess.

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

## The web app

**Recommended: the one the daemon serves.** Open your daemon's URL; it offers to pair with itself. Same origin as the API, so nothing to configure.

**One app for several daemons, on your own hosting.** The app is a static site; the daemons it talks to are added on each device by pairing, and stay in that browser.

- *Cloudflare Workers*: fork this repository, then in the Cloudflare dashboard **Workers & Pages → Create → Import a repository**, root directory `app`, build command `npm run build`, deploy command `npx wrangler deploy`.
- *GitHub Pages*: fork, set **Settings → Pages → Source** to *GitHub Actions*, add the repository variable `DEPLOY_PAGES=true`, and run the `pages` workflow.

Daemons accept requests from any origin by default. That is safe because every request needs a token and no cookies are involved; set `cors.allowed_origins` to limit it to your app's origin.

**Preset daemons (skip pairing).** A deployment can ship a default daemon list in `config.json`, generated at build time from the `MUXTOWER_APP_CONFIG` build variable or secret:

```json
{ "daemons": [{ "name": "build box", "url": "https://muxtower.example.com" }] }
```

Adding `"token"` to an entry skips pairing entirely, but anyone who can load the site can then read that token. The build refuses unless you also set `"acknowledge_public_tokens": true`, and the app shows a warning. Only do this behind an access gate such as Cloudflare Access or your own SSO.

**Moving to another device.** On a paired phone, *Daemons → Add another device* shows one QR code that pairs the other device with every daemon at once. It carries one-time codes, not tokens: each device gets its own token, and the QR stops working after one use or five minutes.

## On Even Realities G2 glasses

The daemon also serves a glasses app at `/g2/` (`glasses/`, an Even Hub app): what needs you first, then each machine's sessions; approve with two taps; long replies as a short summary first (`summaries.provider`); answer by voice, holding or tap-to-tap with the text appearing as you speak (`asr.provider`). Open it with the Even App's developer mode (`npx -p @evenrealities/evenhub-cli evenhub qr --url https://<daemon>/g2/`) and pair it with a code from `muxtower pair`. Details: `glasses/AGENTS.md`, `docs/g2.md`.

## The assistant and MCP

`/v1/mcp` offers muxtower's sessions as MCP tools (list, read, message, approve, deny, interrupt, start, watch) to any MCP client with a device token, e.g. `claude mcp add --transport http muxtower https://<daemon>/v1/mcp --header "Authorization: Bearer <token>"`. With `concierge.enabled`, muxtower keeps its own Claude Code session wired to these tools: talk to it (from the glasses, the apps, or Remote Control) and it relays to, reports on and answers for your other sessions.

## Agents and screen rules

| agent | state from | approve from the phone |
|---|---|---|
| Claude Code | hooks (exact tool and command) + screen rules | yes |
| Codex, OpenCode | none yet: terminal and input only | add screen rules |

For Claude Code, `muxtower run claude` passes `--settings` with HTTP hooks pointing at the daemon; nothing is written to your own `settings.json`.

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
| `cors.allowed_origins` | `MUXTOWER_CORS_ALLOWED_ORIGINS` | `["*"]` | restrict which app origins may call the API |
| `adopt_sockets` | `MUXTOWER_ADOPT_SOCKETS` | `["default"]` | other tmux servers to scan for agents |
| `tmux_socket` | `MUXTOWER_TMUX_SOCKET` | `muxtower` | tmux server for sessions muxtower starts |
| `pairing.mode` | `MUXTOWER_PAIRING_MODE` | `device` | `shared`: every pairing hands out `pairing.shared_token` (for gates that must know each token) |
| `trusted_proxies` | `MUXTOWER_TRUSTED_PROXIES` | loopback | CIDRs of reverse proxies whose `X-Forwarded-For` is believed (for per-client rate limits) |
| `state_dir` | `MUXTOWER_STATE_DIR` | `~/.local/state/muxtower` | database, keys |
| `serve_ui` | `MUXTOWER_SERVE_UI` | `true` | serve the web app at `/` (and the glasses app at `/g2/`) |
| `cors.extra_headers` | — | `[]` | extra request headers apps may send, e.g. a gate's own credential header |
| `remote_control.enabled` | `MUXTOWER_REMOTE_CONTROL_ENABLED` | `false` | also list the Claude Code Remote Control sessions of the Claude account logged in here (private API; may break) |
| `remote_control.environments` | — | `{}` | `environment_id` → machine name to show (the API has no names) |
| `summaries.provider` | `MUXTOWER_SUMMARIES_PROVIDER` | `off` | `claude-code` (`claude -p`) or `codex` (`codex exec`), using that CLI's login on this machine, makes short versions of long replies |
| `summaries.min_chars` / `summaries.eager` | — | `400` / `true` | replies longer than this get a summary; eager: as soon as a session needs you |
| `asr.provider` | `MUXTOWER_ASR_PROVIDER` | `off` | `groq` or `openai`: speech to text for voice replies |
| `asr.api_key_file` / `asr.api_key` | `MUXTOWER_ASR_API_KEY` | — | the provider's key (keep it in a 0600 file) |
| `asr.language` / `asr.prompt` | — | detect / — | pin the language, e.g. `zh`; extra words for the recognizer (session names and common terms are always given) |
| `concierge.enabled` | `MUXTOWER_CONCIERGE_ENABLED` | `false` | keep an assistant session running that you talk to instead of each session (see below) |
| `concierge.model` / `.name` / `.cwd` | — | `sonnet` / `Assistant` / `~` | its model, display name and working directory |
| `concierge.remote_control` / `.args` | — | `true` / `[]` | also reachable from the Claude apps; extra `claude` arguments |
| `hub.headers` | — | `{}` | as a node: headers sent with every request to the hub, for a gate in front of it |

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
