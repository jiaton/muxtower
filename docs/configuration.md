# Configuration

[README](../README.md) · [Install](install.md) · [Web app](web-app.md) · [More than one computer](multi-machine.md) · [Teams](teams.md) · [Agents](agents.md) · [Configuration](configuration.md) · [Security](security.md) · [Design](design.md)

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
| `launch.<runtime>_mode` / `_args` | — | `"agent"` / `[]` | how new sessions start (permission mode, extra arguments): [Permission modes](agents.md#permission-modes) |
| `remote_control.enabled` | `MUXTOWER_REMOTE_CONTROL_ENABLED` | `false` | also list the Claude Code Remote Control sessions of the Claude account logged in here (private API; may break) |
| `remote_control.environments` | — | `{}` | `environment_id` → machine name to show (the API has no names) |
| `codex.shared` | — | `false` | also list, answer and message the threads of the Codex app-server this machine's Codex clients share |
| `codex.headless` | — | `false` | run Codex threads in an app-server of muxtower's own, started from the New session dialog |
| `codex.sandbox` / `.approval_policy` / `.model` | — | `workspace-write` / `on-request` / Codex's | how a headless thread runs (`danger-full-access` where Codex's sandbox cannot start, e.g. a container without user namespaces) |
| `summaries.provider` | `MUXTOWER_SUMMARIES_PROVIDER` | `off` | `claude-code` (`claude -p`) or `codex` (`codex exec`), using that CLI's login on this machine, makes short versions of long replies |
| `summaries.min_chars` / `summaries.eager` | — | `400` / `true` | replies longer than this get a summary; eager: as soon as a session needs you |
| `asr.provider` | `MUXTOWER_ASR_PROVIDER` | `off` | `groq` or `openai`: speech to text for voice replies (the glasses, and the app's microphone button) |
| `asr.api_key_file` / `asr.api_key` | `MUXTOWER_ASR_API_KEY` | — | the provider's key (keep it in a 0600 file) |
| `asr.language` / `asr.prompt` | — | detect / — | pin the language, e.g. `zh`; extra words or guidance for the recognizer (e.g. a line in the script to write a language in), after a short built-in English list of common terms (session names are never sent) |
| Dictionary (Settings → Voice input) | — | empty | kept on the hub, for every device: **words** speech to text should know, which end its prompt (the first ones first, as many as fit in the last 224 tokens Whisper reads; the settings say when some do not), and **corrections** ("heard" → "write": case aside, whole words or phrases, anywhere in Chinese or Japanese, in order, each part replaced once) applied to every transcript. While Live is on, select a word on a session's screen and choose Add to dictionary. |
| `concierge.enabled` | `MUXTOWER_CONCIERGE_ENABLED` | `false` | keep an assistant session running that you talk to instead of each session ([Teams](teams.md#the-concierge)) |
| `concierge.model` / `.name` / `.cwd` | — | `sonnet` / `Assistant` / `~` | its model, display name and working directory |
| `concierge.remote_control` / `.args` | — | `true` / `[]` | also reachable from the Claude apps; extra `claude` arguments |
| `hub.headers` | — | `{}` | as a node: headers sent with every request to the hub, for a gate in front of it |
| `hub.update` | — | `incompatible` | as a node: install the hub's version from PyPI and restart on it when the hub no longer speaks this one's protocol (`incompatible`), whenever the hub runs a later one (`always`), or never |

To run the daemon as a service, see [Install](install.md#run-it-as-a-service).
