# More than one computer

[README](../README.md) · [Install](install.md) · [Web app](web-app.md) · [More than one computer](multi-machine.md) · [Teams](teams.md) · [Agents](agents.md) · [Configuration](configuration.md) · [Security](security.md) · [Design](design.md)

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

## When the hub is down

While the hub's machine restarts, the app reaches the nodes it knows directly, and goes back to the hub once it answers with its nodes linked again ("hub unreachable · direct to …" says so meanwhile). Viewing, approving, sending and interrupting work; push notifications and team changes wait for the hub. For this a node needs an https address of its own that the phone reaches: its `public_url`, or what `tailscale serve` serves it at (found by itself), or one you set for it on the hub's Daemons page. muxtower makes none: Tailscale serve on the node is the simplest; a tunnel on the node (Cloudflare Tunnel, say) does where a VPN is not an option. The hub hands each device an address and a token per node while it answers (revoking the device on the hub revokes those too, on a node that is away once it is back). Not a second hub: nothing is copied between machines.

## Claude sessions outside tmux

Claude sessions started outside tmux (the desktop app, an IDE, `claude remote-control`) are listed by the hub's own Remote Control, as that computer's when their process runs on a node: the node says which run there, from Claude Code's own files, with no login of its own. A node signed in to another Claude account lists that account's sessions itself: turn `remote_control.enabled` on for it (on macOS it reads the Claude login from the Keychain, as Claude Code does).
