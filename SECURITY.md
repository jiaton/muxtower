# Security policy

muxtower lets whoever holds a device token type into terminals and approve what coding agents run, so a flaw in it can amount to running commands on the machine. Please report one privately.

## Official addresses

The only official domains are **muxtower.dev** (the site and its demo) and **app.muxtower.dev** (the public copy of the app). Anything else asking for your daemon's address or a pairing code is not us. muxtower itself never asks for a token: a pairing code is entered only in an app you chose, and is good once.

## Reporting

Use GitHub's private reporting: **Security → Report a vulnerability** on this repository. Please do not open a public issue, discussion or pull request for it.

Include what an attacker needs (network position, a token or none, a paired device, a node), the steps, and the version (`muxtower --version`). Reports are answered as soon as possible, and fixed in a release before anything is disclosed.

## Official domains

The project's own: **muxtower.dev** (the website and its demo) and **app.muxtower.dev** (the public hosted web app, built from release tags with no preset daemons). Any other host offering a muxtower app is not the project's; the app your daemon serves itself needs no one's hosting.

## Supported versions

Only the latest release on PyPI gets fixes. Update the hub first: its nodes are told, and install the hub's version themselves when it no longer speaks theirs, or always with `hub.update = "always"`.

## In scope

- Anything that reaches the API, the WebSocket, the hooks or the node link without a valid token, or with a revoked one.
- A token doing more than it should: a node's token using the hub's API, a hook token acting on another session.
- Pairing: guessing, replaying or reusing a code; a code or token ending up in logs or URLs.
- Reading a file through the daemon that the conversation did not show, or input reaching a shell other than the agent's pane.
- The web app: script injection from session names, screens or conversations; tokens leaking to another origin.
- The hosted app at app.muxtower.dev and the website at muxtower.dev: code served there that is not a release's.

## Out of scope

- What a paired device can do by design: it drives your agents, and the agents run with your account's rights.
- An agent itself running something harmful once approved.
- Running the daemon without HTTPS, or on an address others can reach without a gate, against the README's advice.
- The Claude Remote Control integration breaking because its private API changed.
