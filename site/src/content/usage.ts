export const usage = {
  label: '07',
  title: 'Built to cost little.',
  lead: 'A daemon runs all day on every machine you own, so it has to be cheap, and it measures itself to prove it. Every number here is from `docs/design.md`, measured or enforced in code.',
}

/** One engineering fact: a figure a developer can check, and the sentence that explains it. */
export interface Figure {
  figure: string
  text: string
}

export const figures: Figure[] = [
  {
    figure: '111 B',
    text: 'A busy Claude Code screen is 8.9 KB on the wire. The next one goes as a patch on it: 111 B, about 80 times less. The diff follows lines scrolling off the top, since Claude Code writes above its input box.',
  },
  {
    figure: '2 ms',
    text: 'The most a patch may take to work out. Longer, or not smaller, and the whole screen goes instead. One diff per screen serves every connection.',
  },
  {
    figure: '5 s',
    text: 'How often a pane nobody watches, with no output since its last read, is read; one that is live, every second. Keys typed in a row are read once, 40 ms after the last.',
  },
  {
    figure: '0',
    text: 'Outside commands run to measure: /proc on Linux, the kernel’s own calls on macOS, no `ps` or `lsof`. A value it cannot read shows as unknown, never as 0.',
  },
  {
    figure: '20 ms',
    text: 'A Codex hook relay, standard library only. muxtower trusts exactly the hooks it adds, for the session it starts, and writes nothing to `~/.codex`.',
  },
  {
    figure: '30 s',
    text: 'The longest a phone that changed networks sits on a dead socket: a ping after 25 s of quiet, 5 s to answer, then it reconnects at once.',
  },
  {
    figure: '20%',
    text: 'Of a core, or 200 ms a round, or 500 MB: past any limit, a mark by the machine’s name says what, how much, and which screen rule was slowest. The app measures its own frames and draw time too.',
  },
]

export interface UsageRow {
  machine: string
  cpu1m: number
  cpu10m: number
  rssMb: number
  tickMs: number
  /** Over a limit: what the mark by the machine's name says. */
  alert?: string
}

/** Made-up numbers in the shape `GET /v1/usage` returns. */
export const usageRows: UsageRow[] = [
  { machine: 'nas', cpu1m: 1.8, cpu10m: 2.1, rssMb: 46, tickMs: 4 },
  { machine: 'server', cpu1m: 0.9, cpu10m: 1.2, rssMb: 38, tickMs: 3 },
  { machine: 'vps', cpu1m: 1.1, cpu10m: 1.0, rssMb: 41, tickMs: 3 },
  {
    machine: 'macbook',
    cpu1m: 24.6,
    cpu10m: 9.8,
    rssMb: 52,
    tickMs: 230,
    alert: 'tick 230 ms (limit 200): slowest: rule tool-permission on shop-research, 190 ms',
  },
  { machine: 'pc', cpu1m: 1.4, cpu10m: 1.6, rssMb: 44, tickMs: 5 },
]
