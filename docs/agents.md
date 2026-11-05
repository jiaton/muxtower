# Agents, screen rules and permission modes

[README](../README.md) · [Install](install.md) · [Web app](web-app.md) · [More than one computer](multi-machine.md) · [Teams](teams.md) · [Agents](agents.md) · [Configuration](configuration.md) · [Security](security.md) · [Design](design.md)

## Agents

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

A file in `~/.config/muxtower/runtimes/` replaces the shipped one with the same name; a new file adds an agent. Each rule maps a regex to a state (`needs_permission`, `needs_answer`, `needs_trust`, `plan_review`, `error`, `busy`, `idle`). The `[menu]` section sets the cursor glyph that marks the highlighted choice (`other_cursors` for a dialog that draws another one), and `[approve.prefer]` sets which choice "approve" picks. The session page shows which rule matched.

Sessions that muxtower did not start (found in your own tmux) can be watched, answered and approved, but never killed.

## Permission modes

muxtower adds no permission flag of its own: a session asks you, or not, as its agent's own settings say (Claude Code's `defaultMode` in `~/.claude/settings.json`, Codex's `config.toml`). To start one otherwise, pick its **Permission mode** in the New session dialog (each runtime lists its own: plan, ask, accept edits, auto, bypass for Claude Code; untrusted, on request, full auto, full access for Codex), or set a default per runtime, with extra arguments, in the app's Settings (*New sessions*) or the config file:

```toml
[launch]
claude_code_mode = "acceptEdits"   # or "agent": its own settings decide
claude_code_args = ["--model", "opus"]
```

The mode is kept when a session is started again after a restart. An agent starting a session over MCP (`start_session`) can ask for a mode only up to that default, and never bypass or full access, unless you turn `launch.agents_may_escalate` on. In an asking mode, team members stop at every permission prompt and tasks sent to them wait meanwhile: turn on auto-approve for such a session, or start it in auto or accept-edits mode.
