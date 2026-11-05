# Install and reach it from your phone

[README](../README.md) · [Install](install.md) · [Web app](web-app.md) · [More than one computer](multi-machine.md) · [Teams](teams.md) · [Agents](agents.md) · [Configuration](configuration.md) · [Security](security.md) · [Design](design.md)

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

## Quickest: Tailscale

No domain, no open port; only devices on your tailnet can reach the daemon. With Tailscale signed in on this machine and on the phone:

```sh
muxtower expose tailscale     # → https://<machine>.<tailnet>.ts.net, written to the config as public_url
```

It runs `tailscale serve` for you, which keeps serving across restarts. The first time, Tailscale may ask you to turn on HTTPS for the tailnet; on Linux it needs root or `sudo tailscale set --operator=$USER` once.

## Your own domain, reachable from anywhere

Any device with a browser can then use it, with no VPN app. Use what you already have:

- **Caddy** (certificates are automatic):
  ```
  muxtower.example.com {
      reverse_proxy 127.0.0.1:8731
  }
  ```
- **Cloudflare Tunnel** (no open port): a named tunnel with a public hostname pointing at `http://127.0.0.1:8731`. `cloudflared tunnel --url http://127.0.0.1:8731` gives a throwaway address to try it.
- **nginx, Traefik, a load balancer**: any reverse proxy that passes WebSocket upgrades.

On the open internet, muxtower's own authentication is the lock (see [Security](security.md)): every device has its own revocable token, pairing codes are single-use, expire in five minutes and are rate-limited, and only a wrong credential answers 401/403, so fail2ban or your WAF can ban whoever is guessing.

**Add your own sign-in in front if you like** (Cloudflare Access, an SSO proxy such as oauth2-proxy or Authelia, a password gate). The gate must let `OPTIONS` requests through unauthenticated. The simplest setup is to sign in to the gate once in each browser: its cookie then covers the app, the API and the WebSocket, and the daemon's own token travels in `Authorization` (which gates usually ignore). If the gate is off-site and nobody has signed in, the app says so and links to the daemon, instead of retrying; it never sends anything a gate would count as a password guess. Nodes reach a hub behind a gate that wants a header of its own through `hub.headers`, and `pairing.mode = "shared"` is for gates that must know every token.

## Run it as a service

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
