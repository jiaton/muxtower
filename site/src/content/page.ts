/** The page's copy outside its lists. English only; `code` in backticks. Every sentence states a fact a
 *  developer can check in the README or docs/design.md. */

export const nav = [
  { href: '#demo', label: 'Demo' },
  { href: '#hub', label: 'Hub' },
  { href: '#team', label: 'Teams' },
  { href: '#assistant', label: 'Assistant' },
  { href: '#api', label: 'API' },
  { href: '#install', label: 'Install' },
  { href: '#faq', label: 'FAQ' },
]

export const hero = {
  eyebrow: 'Open source · self-hosted · no account',
  title: 'Every machine. Every agent. One list.',
  lead: 'muxtower watches the Claude Code and Codex sessions on all your computers and lists them on a hub you host. When one needs you, your phone says so, and you answer from there.',
  install: 'pipx install muxtower',
  tryApp: 'Open the real app',
  tryAppNote: 'against a simulated daemon',
}

export const hub = {
  label: '01',
  title: 'One hub. Every machine dials in.',
  lead: 'Run a daemon on each computer and join it to the one that is always on. Your phone needs only the hub’s address.',
  facts: [
    'A joined machine dials out to the hub, so a laptop needs no address and no open port.',
    'The hub reaches your phone over HTTPS: `muxtower expose tailscale`, or your own domain behind any proxy. No SSH to expose.',
    'A sleeping laptop’s sessions stay listed, marked offline, and come back when it wakes.',
  ],
}

export const team = {
  label: '02',
  title: 'Agents that work as a team.',
  lead: 'Every session muxtower starts reaches it as itself, over MCP. It can see who else works on its project and hand them work.',
  facts: [
    'A role is plain text you give: research, worker, reviewer. muxtower keeps it and reads nothing into it.',
    'A project is its git remote, so one repository on two machines is one project, worktrees included.',
    'A task waits while its receiver is waiting on you: it is never typed into an open prompt.',
  ],
}

export const sources = {
  label: '04',
  title: 'Wherever the session started.',
  lead: 'You do not have to start agents through muxtower. It finds them where they already run.',
}

export const reach = {
  label: '05',
  title: 'Answer from wherever you are.',
}

export const security = {
  label: '09',
  title: 'Safe on the open internet.',
  lead: 'muxtower brings its own lock, and fits behind whatever you already run.',
}

export const install = {
  label: '10',
  title: 'Running in two minutes.',
  lead: 'Python 3.11+ and tmux on the machine your agents run on. The daemon serves the app itself.',
}

export const footer = {
  tagline: 'A control tower for the coding agents on your machines.',
  status: 'Early: version 0.1. Interfaces may change.',
  license: 'Apache-2.0',
}
