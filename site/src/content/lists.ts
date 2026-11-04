import type { TerminalLine } from '@/components/shared/terminal'

/** Transcripts are muxtower's real commands and the exact shape of what they print. */
export const securityList = [
  { icon: 'key', title: 'A token per device', text: 'Every phone, browser and machine has its own, revoked on its own.' },
  { icon: 'ticket', title: 'One-time pairing codes', text: 'Single use, five minutes, rate-limited. A new phone is one QR code.' },
  { icon: 'ban', title: 'Bans the guessers', text: 'Only a wrong credential answers 401 or 403, so fail2ban can act on it.' },
  { icon: 'door', title: 'Your sign-in in front', text: 'Cloudflare Access, an SSO proxy or a password gate covers it all.' },
  { icon: 'cloud-off', title: 'No muxtower cloud', text: 'The daemon is yours, and so is your code. This site never sees a token.' },
] as const

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
  {
    id: 'join',
    label: 'Join another machine',
    note: 'It dials out to the hub: no address and no open port on this machine.',
    lines: [
      { kind: 'comment', text: '# on the hub, the machine that is always on' },
      { kind: 'command', text: 'muxtower pair' },
      { kind: 'output', text: 'Or open https://hub.example on the device and enter the code: K7QM-3XPA' },
      { kind: 'output', text: 'The code works once and expires at 21:47 UTC.' },
      { kind: 'comment', text: '# on every other machine' },
      { kind: 'command', text: 'pipx install muxtower' },
      { kind: 'command', text: 'muxtower pair --join https://hub.example --code K7QM-3XPA' },
      { kind: 'output', text: 'joined https://hub.example as server' },
    ] satisfies TerminalLine[],
  },
]
