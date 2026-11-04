import type { Message, Session } from './world'

/** Session ids look like the daemon's: twelve hex digits. */
export const IDS = { research: '7c1e04a9b2d3', worker: '5b9f2e81c044' }

const SESSIONS: Session[] = [
  {
    id: 'research', name: 'shop-research', device: 'mac', folder: '~/code/shop', home: 'shop', agent: 'claude',
    source: 'muxtower', role: 'research', state: 'idle',
    last: 'Plan: retry a charge 3 times with backoff, the order id as its idempotency key.',
  },
  {
    id: 'worker', name: 'shop', device: 'server', folder: '~/code/shop', home: 'shop', agent: 'claude',
    source: 'muxtower', role: 'worker', state: 'idle', last: 'Fixed and merged as PR 212: refunds add up again.',
  },
  {
    id: 'api', name: 'api', device: 'vps', folder: '~/code/api', home: 'api', agent: 'codex', source: 'tmux',
    state: 'working', last: 'Writing migrations/0042_add_retry_columns.sql',
  },
  {
    id: 'web', name: 'web', device: 'pc', folder: '~/code/web', home: 'web', agent: 'codex', source: 'Desktop app',
    state: 'working', last: 'Rebuilding the usage chart against /v2/usage',
  },
  {
    id: 'infra', name: 'infra', device: 'nas', folder: '~/code/infra', home: 'infra', agent: 'claude', source: 'muxtower',
    state: 'idle', last: 'Backups verified: 14 of 14 restored cleanly.',
  },
  {
    id: 'notes', name: 'Release notes 2.4', device: 'mac', folder: '~/code/shop', home: 'shop', agent: 'claude',
    source: 'Desktop app', state: 'idle', last: 'Release notes for 2.4 are drafted, grouped by New and Fixed.',
  },
  {
    id: 'fork', name: 'Release notes 2.4', device: 'mac', folder: '~/code/shop', home: 'shop', agent: 'claude',
    source: 'Desktop app', state: 'unread', parent: 'notes', hidden: true, last: 'Shorter, for the changelog: one line per change.',
  },
  {
    id: 'side', name: 'Release notes 2.4', device: 'mac', folder: '~/code/shop', home: 'shop', agent: 'claude',
    source: 'Desktop app', state: 'unread', parent: 'notes', sideChat: true, hidden: true,
    last: 'Yes: PR 212 fixed refund rounding, so it goes under Fixed.',
  },
] // prettier-ignore

const MESSAGES: Record<string, Message[]> = {
  research: [
    { id: 'r1', kind: 'you', text: 'About 1 in 200 charges fail with a gateway timeout. Find out why, then plan a fix.' },
    { id: 'r2', kind: 'tool', tool: 'Grep', text: '"timeout" in src/payments', output: ['14 matches in 4 files'] },
    { id: 'r3', kind: 'tool', tool: 'Read', text: 'src/payments/client.ts', output: ['212 lines'] },
    {
      id: 'r4',
      kind: 'agent',
      text: 'The client gives up after one 10 s timeout and never retries. The gateway takes an idempotency key, so a retry can never charge twice.',
    },
    { id: 'r5', kind: 'you', text: 'Plan it. Keep it small, and have the worker do it.' },
    {
      id: 'r6',
      kind: 'agent',
      text: 'Plan: retry a charge 3 times with backoff (200, 400, 800 ms), the order id as its idempotency key, and a test for each path.',
    },
  ],
  worker: [
    { id: 'w1', kind: 'you', text: 'A refund split three ways loses a cent. Fix the rounding.' },
    { id: 'w2', kind: 'tool', tool: 'Edit', text: 'src/payments/refunds.ts', output: ['+9 −4'] },
    { id: 'w3', kind: 'tool', tool: 'Bash', text: 'npm test -- refunds', output: ['Tests: 18 passed, 18 total'] },
    { id: 'w4', kind: 'agent', text: 'The last share now takes the remainder, so the parts always add up. Merged as PR 212.' },
  ],
  api: [
    { id: 'a1', kind: 'you', text: 'Payments needs retry_count and last_error on charges. Add a migration and the model fields.' },
    {
      id: 'a2',
      kind: 'tool',
      tool: 'Bash',
      text: "rg -n 'class Charge' app/models",
      output: ['app/models/charge.py:14:class Charge(Base):'],
    },
    { id: 'a3', kind: 'tool', tool: 'Edit', text: 'app/models/charge.py', output: ['+6 −0'] },
    { id: 'a4', kind: 'tool', tool: 'Edit', text: 'migrations/0042_add_retry_columns.sql', output: ['+11 −0'] },
  ],
  notes: [
    { id: 'n1', kind: 'you', text: 'Draft the release notes for 2.4 from the merged pull requests.' },
    { id: 'n2', kind: 'tool', tool: 'Bash', text: 'gh pr list --state merged --search "milestone:2.4"', output: ['9 pull requests'] },
    { id: 'n3', kind: 'agent', text: 'Release notes for 2.4 are drafted, grouped by New and Fixed.' },
  ],
}

/** Fresh copies of the sessions and their conversations. */
export function sessionsSeed(): { sessions: Session[]; messages: Record<string, Message[]> } {
  return {
    sessions: SESSIONS.map((s) => ({ ...s })),
    messages: Object.fromEntries(Object.entries(MESSAGES).map(([k, v]) => [k, v.map((m) => ({ ...m }))])),
  }
}
