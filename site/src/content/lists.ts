import type { TerminalLine } from '@/components/shared/terminal'

/** Transcripts are muxtower's real commands and the exact shape of what they print. */
export const joinTranscript: TerminalLine[] = [
  { kind: 'comment', text: '# on the hub, the machine that is always on' },
  { kind: 'command', text: 'muxtower pair' },
  { kind: 'output', text: 'Or open https://hub.example on the device and enter the code: K7QM-3XPA' },
  { kind: 'output', text: 'The code works once and expires at 21:47 UTC.' },
  { kind: 'comment', text: '# on every other machine' },
  { kind: 'command', text: 'pipx install muxtower' },
  { kind: 'command', text: 'muxtower pair --join https://hub.example --code K7QM-3XPA' },
  { kind: 'output', text: 'joined https://hub.example as server' },
]

export const teamTranscript: TerminalLine[] = [
  { kind: 'comment', text: '# the research session, on the MacBook, calls my_team' },
  { kind: 'output', text: 'You: 3f2a9c · Payment retries · role: research · @macbook · idle · project acme/shop' },
  { kind: 'output', text: 'Your team (1 other session in acme/shop):' },
  { kind: 'output', text: '- 8be41d · shop · role: worker · @server · idle · worktree ~/code/shop on main' },
  { kind: 'comment', text: '# then hands the worker the plan' },
  { kind: 'output', text: 'send_task(to: "worker", text: "Add retries with backoff to the payment client…")' },
  {
    kind: 'output',
    text: 'Delivered to shop (worker, 8be41d): it takes it up when it can (Claude Code queues it behind what it is doing).',
  },
]

export const sourceList = [
  {
    title: 'tmux',
    text: 'Claude Code and Codex in tmux are picked up as they are. `muxtower run claude` starts one with hooks pointed at the daemon, and writes nothing to your own settings.',
  },
  {
    title: 'Claude desktop and Remote Control',
    text: 'Sessions from the desktop app, an IDE or `claude remote-control` are listed with their conversation, on the computer they run on. Forks and side chats are found and filed under the session they came from.',
  },
  {
    title: 'The Codex app',
    text: 'With `codex.shared = true`, muxtower joins the app-server your Codex clients share: threads from the Codex app are listed, answered and messaged like any other.',
  },
  {
    title: 'Any terminal agent',
    text: 'Anything else in tmux can be watched and typed into. Screen rules in plain TOML teach muxtower its dialogs.',
  },
]

export const reachList = [
  {
    title: 'Push notifications',
    text: 'When an agent needs you or finishes a turn, with a few-line summary of a long reply. The tap opens that session.',
  },
  {
    title: 'Reply to a message',
    text: 'Quote the exact line you are answering. It lands in the agent’s prompt as if you had typed it there.',
  },
  {
    title: 'Approve with the exact command',
    text: 'Hooks say what the agent wants to run. Approving re-reads the live screen and picks the option with the arrow keys.',
  },
  { title: 'Voice', text: 'Dictate a reply. Session names and your terms are sent along, so they are spelled right.' },
  { title: 'Keys a terminal needs', text: 'Arrows, Enter, Esc, Tab and Ctrl-C on a pad, for any prompt muxtower has no button for.' },
  { title: 'Even Realities G2', text: 'On your glasses: what needs you first, approve with two taps, answer by voice.' },
]

export const securityList = [
  { title: 'A token per device', text: 'Each phone, browser and machine has its own, revocable on its own.' },
  {
    title: 'One-time pairing codes',
    text: 'Single use, five minutes, rate-limited. Moving to a new phone is one QR code, not a copied token.',
  },
  { title: 'Bans the guessers', text: 'Only a wrong credential answers 401 or 403, so fail2ban or your WAF can ban whoever is guessing.' },
  {
    title: 'Your own sign-in in front',
    text: 'Cloudflare Access, an SSO proxy or a password gate: one sign-in covers the app, the API and the stream.',
  },
  {
    title: 'No muxtower cloud',
    text: 'The daemon is yours. Your code stays on your machines; this site is static and never sees a token.',
  },
]

export const installTabs = [
  {
    id: 'tailscale',
    label: 'Tailscale',
    note: 'No domain and no open port: only devices on your tailnet reach the daemon.',
    lines: [
      { kind: 'command', text: 'pipx install muxtower' },
      { kind: 'command', text: 'muxtower run claude' },
      { kind: 'command', text: 'muxtower expose tailscale' },
      { kind: 'command', text: 'muxtower pair' },
    ] satisfies TerminalLine[],
  },
  {
    id: 'domain',
    label: 'Your own domain',
    note: 'Any proxy that passes WebSocket upgrades: Caddy, Cloudflare Tunnel, nginx, Traefik.',
    lines: [
      { kind: 'command', text: 'pipx install muxtower' },
      { kind: 'command', text: 'muxtower run claude' },
      { kind: 'comment', text: '# point https://muxtower.example.com at 127.0.0.1:8731, then' },
      { kind: 'command', text: 'muxtower pair --url https://muxtower.example.com' },
    ] satisfies TerminalLine[],
  },
]
