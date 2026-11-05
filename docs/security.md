# Security model

[README](../README.md) · [Install](install.md) · [Web app](web-app.md) · [More than one computer](multi-machine.md) · [Teams](teams.md) · [Agents](agents.md) · [Configuration](configuration.md) · [Security](security.md) · [Design](design.md)

- One daemon has one owner. Each paired device holds its own token, stored hashed on the daemon. Revoke a device from the app or with `muxtower pair --revoke`.
- Pairing codes are single-use, expire after five minutes, and are rate-limited. They travel in the URL fragment, which browsers never send to a server.
- The web app's WebSocket authenticates with an HttpOnly cookie when it is served by the daemon itself. Otherwise it sends the token as a WebSocket subprotocol, and falls back to `?access_token=` only for proxies that pass nothing else (never `?token=`, which gates treat as a guess). Every socket is preceded by one plain request, so a revoked token or a gate costs one refused request, not a burst. Access logs redact `access_token=`.
- The API never runs shell strings. It starts only the binaries defined by runtime files, and approval keys are sent only after the live screen shows the dialog.
- Only a wrong credential (a bad token, a wrong pairing code, a refused WebSocket) answers 401 or 403, so a log watcher such as fail2ban can count those as guessing. Ordinary refusals use 400/409/429, and the app stops calling a daemon that rejected its token instead of retrying.
- A node joins its hub with a pairing code and gets a token of its own, which opens its link and nothing else: it cannot use the hub's API. The hub can do on a node what a paired device can do there, so join only your own computers.
- Every action (input, approve, deny, create, terminate, pair, revoke) is written to an audit log with the device name. Typed text is never logged.

How a gate in front of the daemon works with this: [Install](install.md#your-own-domain-reachable-from-anywhere). Reporting a vulnerability: [SECURITY.md](../SECURITY.md).
