/** The page's copy. English only; `code` in backticks. Short: a visitor reads it at a glance. */

export const nav = [
  { href: '#hub', label: 'Hub' },
  { href: '#team', label: 'Teams' },
  { href: '#features', label: 'Features' },
  { href: '#install', label: 'Install' },
  { href: '#faq', label: 'FAQ' },
]

export const hero = {
  eyebrow: 'Open source · self-hosted · no account',
  title: 'Every machine. Every agent. One list.',
  lead: 'muxtower lists the Claude Code and Codex sessions on all your computers on one hub you host. When one needs you, your phone says so, and you answer from there.',
  install: 'pipx install muxtower',
  tryApp: 'Try the live demo',
  tryAppNote: 'The real app on made-up sessions. Click anything.',
}

export const hub = {
  eyebrow: 'Hub',
  title: 'One hub. Every machine dials in.',
  lead: 'A daemon on each computer joins the one that is always on. Your phone only needs the hub.',
  facts: [
    { title: 'No open ports', text: 'Machines dial out to the hub. A laptop needs no address.' },
    { title: 'HTTPS, not SSH', text: 'Tailscale or your own domain. Nothing else to expose.' },
    { title: 'Hub down? Keep going', text: 'The app talks to each machine directly until the hub is back.' },
  ],
}

export const team = {
  eyebrow: 'Teams',
  title: 'Agents that work as a team.',
  lead: 'Give sessions a role. Each one sees who else works on its project, across machines, and hands them work over MCP.',
  facts: [
    'A role is plain text: pm, worker, reviewer.',
    'A project is its git remote, on any machine.',
    'A task waits while its receiver waits on you.',
  ],
}

export const features = {
  eyebrow: 'Features',
  title: 'Everything else you need from your phone.',
}

export const security = {
  eyebrow: 'Security',
  title: 'Safe on the open internet.',
  lead: 'Its own lock, and it fits behind whatever you already run.',
}

export const install = {
  eyebrow: 'Install',
  title: 'Running in two minutes.',
  lead: 'Python 3.11+ and tmux. The daemon serves the app itself.',
}

/** The public hosted app: the real one, for your own daemons, apart from the demo. */
export const hostedApp = {
  title: 'Or use the hosted app',
  text: 'Pair it with your daemon’s HTTPS address. Your daemon serves the same app itself.',
  action: 'Open the app',
}

export const footer = {
  cta: 'Every agent, on every machine, in your pocket.',
  tagline: 'A control tower for the coding agents on your machines.',
  status: 'Early: version 0.1. Interfaces may change.',
  license: 'Apache-2.0',
}
