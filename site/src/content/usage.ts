export const usage = {
  label: '07',
  title: 'Light, and it shows you.',
  lead: 'Every daemon measures itself every 5 seconds, with no outside command, and the hub gathers every machine’s numbers in the app’s Daemons page and in `GET /v1/usage`.',
  facts: [
    'CPU over the last minute and the last ten, memory, threads, open files, and how long each round of reading the screens takes.',
    'Over a limit (20% of a core, 200 ms a round, 500 MB), a mark by the machine’s name says what, how much and the limit. A slow round names its slowest screen rule.',
    'The app measures itself too: live frames, how long a terminal takes to draw, and its memory.',
  ],
}

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
