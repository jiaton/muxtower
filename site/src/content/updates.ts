import type { TerminalLine } from '@/components/shared/terminal'

export const updates = {
  label: '08',
  title: 'Update the hub. The rest follow.',
  lead: 'Upgrade the one machine that is always on. On every link it tells each machine joined to it which version it runs.',
  facts: [
    'A machine too old to talk to its hub installs the hub’s version from PyPI (pipx, or pip outside it) and restarts in place, with the same process id, so systemd or launchd sees no exit.',
    'One that is only older is told, in `muxtower` and on the Daemons page. With `hub.update = "always"` it follows every update; with `"never"` it is only told.',
    'It never downgrades. If PyPI does not have the release yet, it tries again ten minutes later, as long as the hub still runs it.',
  ],
}

export const updatesTranscript: TerminalLine[] = [
  { kind: 'comment', text: '# on the hub, and only there' },
  { kind: 'command', text: 'pipx upgrade muxtower' },
  { kind: 'comment', text: '# on a machine that should follow every hub update: ~/.config/muxtower/config.toml' },
  { kind: 'output', text: '[hub]' },
  { kind: 'output', text: 'update = "always"   # default: only when it must; "never": only tell me' },
]
