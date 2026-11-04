export const usage = {
  eyebrow: 'Performance',
  title: 'Built to cost little.',
  lead: 'It runs all day on every machine, so it stays light.',
}

/** One figure and a line on what it means. */
export interface Figure {
  figure: string
  text: string
}

export const figures: Figure[] = [
  { figure: '111 B', text: 'per terminal update, not the whole 8.9 KB screen.' },
  { figure: '5 s', text: 'between reads of an idle pane nobody watches.' },
  { figure: '0', text: 'outside commands run to measure itself.' },
  { figure: '30 s', text: 'at most to reconnect when your phone switches networks.' },
  { figure: '20%', text: 'of a core is its limit. Past it, the app tells you.' },
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
