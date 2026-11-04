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
  tryApp: 'Try the real app',
  tryAppNote: 'The actual muxtower app in your browser, against a simulated daemon. Nothing to install.',
  /** Under the demo: the animation is drawn, the app is real. */
  afterDemo: 'That was an animation. The real app is one click away: every button works, on six made-up sessions.',
}

export const hub = {
  label: '01',
  title: 'One hub. Every machine dials in.',
  lead: 'Run a daemon on each computer and join it to the one that is always on. Your phone needs only the hub’s address.',
  facts: [
    'A joined machine dials out to the hub, so a laptop needs no address and no open port.',
    'The hub reaches your phone over HTTPS: `muxtower expose tailscale`, or your own domain behind any proxy. No SSH to expose.',
    'A sleeping laptop’s sessions stay listed, marked offline, and come back when it wakes.',
    'Hub down, its machine restarting? The app reaches each machine directly at its own HTTPS address, and goes back to the hub once it answers. Viewing, approving and sending go on; push and team changes wait for the hub. Not a second hub: nothing is copied.',
  ],
  direct: {
    title: 'Give a machine its own address',
    lead: 'For the hub-down fallback the phone must reach each machine itself, over HTTPS. muxtower opens nothing: pick one per machine, or set an address for it on the hub’s Daemons page.',
  },
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
  title: 'Start at your desk. Carry on from your phone.',
  lead: 'Sessions you start in the Claude desktop app or the Codex app are listed beside the rest, with their whole conversation, and answered from here as if you were at the desk.',
  facts: [
    'With `remote_control.enabled`, muxtower lists the Remote Control sessions of the Claude account logged in on the hub: the desktop app, the mobile apps, `claude remote-control`.',
    'Approve, deny, answer a question, send a message or interrupt: it goes back to that same session, and the desktop app shows it answered.',
    'Unread is shared with the Claude apps, so what you read on the phone is read at the desk. Archive it here and it is archived there.',
    'With `codex.shared = true` the Codex app’s threads work the same way: an answer from here closes the dialog in the app too.',
  ],
  caveat: 'Remote Control is a private API: an update to Claude can break it until muxtower follows.',
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

/** The public hosted app: the real one, for your own daemons, apart from the demo. */
export const hostedApp = {
  title: 'Open the app',
  text: 'Pair it with your own daemons. Your daemon serves this same app itself; using that one means trusting no one else’s hosting.',
  action: 'Open the app',
}

export const footer = {
  tagline: 'A control tower for the coding agents on your machines.',
  status: 'Early: version 0.1. Interfaces may change.',
  license: 'Apache-2.0',
}
