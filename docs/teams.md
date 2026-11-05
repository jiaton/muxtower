# Teams, MCP and the concierge

[README](../README.md) · [Install](install.md) · [Web app](web-app.md) · [More than one computer](multi-machine.md) · [Teams](teams.md) · [Agents](agents.md) · [Configuration](configuration.md) · [Security](security.md) · [Design](design.md)

Sessions can work as a team. Each has a **role** (free text: what it is for, set by you or by the agents) and a **project** (worked out once from its git remote or folder, or set). A team is every session of one project, on whichever machine it runs.

- `my_team` tells a session who it is and who works with it: each teammate's role, machine, state, folder and branch, and the tasks it was sent last.
- `send_task` hands work to a teammate: `to` is a role in your project, `role@project` for another project, or a session id. It arrives headed `[muxtower task from <you>]`; while the receiver waits on a prompt it is queued, and every task is kept on record. This is the default way to write to a teammate.
- `send_message` types into a session at once: only to answer the prompt it is stopped on, send a slash command, or pass on your own words. It arrives headed `[muxtower message from <sender>]`, so no agent's text passes for yours.
- `watch_session` tells the calling session when another one finishes a turn, needs you, or ends.
- When two sessions write in the same git worktree at once, both are told (a mark in the app, a line in `my_team`), so one commit does not take the other's unfinished change along.
- Across machines, all of this goes through the hub, which sees every session; a node without its hub changes no team data.

Agents set this up themselves with MCP; you can set a session's role and project from the app (Team). More: [design.md › Teams](design.md#teams).

## MCP

`/v1/mcp` offers muxtower's sessions as MCP tools (list, read, message, approve, deny, interrupt, start, watch) to any MCP client with a device token, e.g. `claude mcp add --transport http muxtower https://<daemon>/v1/mcp --header "Authorization: Bearer <token>"`.

## The concierge

With `concierge.enabled`, muxtower keeps its own Claude Code session wired to these tools: talk to it (from the glasses, the apps, or Remote Control) and it relays to, reports on and answers for your other sessions.

## The stream

The stream (`/v1/stream`) can send a screen as patches on the one before (`encoding: "lines"`, [design.md › Screens as patches](design.md#screens-as-patches)); a client of your own can ignore that and gets whole screens.
