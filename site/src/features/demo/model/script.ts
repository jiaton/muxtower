import { sessionById, type Session, type World } from './world'

/** Where the cursor goes: an element marked `data-demo="<id>"`, per layout (the wide stage has the
 *  desktop window and the phone, the tall one the phone and a strip of machines). None: it fades. */
export interface Target {
  wide?: string
  tall?: string
}

export interface Step {
  /** Milliseconds from the start of the demo. */
  at: number
  do?: (world: World) => void
  cursor?: Target | null
  click?: boolean
  /** Typed into the phone's message box, a character at a time over `ms`. */
  type?: { text: string; ms: number }
}

export interface Beat {
  id: string
  title: string
  /** One sentence; `code` in backticks. */
  caption: string
  start: number
}

const patch = (world: World, id: string, fields: Partial<Session>) => Object.assign(sessionById(world, id) ?? {}, fields)
const both = (id: string): Target => ({ wide: id, tall: id })

const ASK = 'Migration 0042 is written. Run it on staging first?'
const REPLY = 'Yes, staging first. Then show me the row counts.'
const TASK = 'Add retries with backoff to the payment client, then run its tests.'

export const BEATS: Beat[] = [
  {
    id: 'machines',
    title: 'Every machine',
    caption: 'A NAS, a server, a VPS, a MacBook and a PC. Claude Code and Codex on each, four projects at once, one list.',
    start: 0,
  },
  { id: 'notify', title: 'Notified', caption: 'An agent on the VPS finishes. Your phone tells you, and the tap lands on it.', start: 5000 },
  {
    id: 'reply',
    title: 'Reply',
    caption: 'Reply to the exact message. It lands in the agent’s prompt, in the terminal it runs in.',
    start: 10000,
  },
  {
    id: 'team',
    title: 'Team',
    caption: 'The research agent finds its worker with `my_team` and hands it the plan with `send_task`.',
    start: 15500,
  },
  {
    id: 'approve',
    title: 'Approve',
    caption: 'The worker wants to run its tests. One tap, and it reads the live screen first.',
    start: 21000,
  },
  {
    id: 'forks',
    title: 'Forks',
    caption: 'A fork and a side chat made in Claude desktop, found and filed under the session they came from.',
    start: 25500,
  },
  {
    id: 'hub',
    title: 'One hub',
    caption: 'Each machine runs a daemon and dials out to the hub. Your phone talks only to the hub, over HTTPS. No SSH.',
    start: 30000,
  },
]

export const DURATION = 36000

export const STEPS: Step[] = [
  { at: 0, cursor: { wide: 'nav-devices', tall: 'strip' } },
  { at: 600, do: (w) => void (w.flash = 'devices') },
  { at: 2600, cursor: { wide: 'row-web', tall: 'strip-pc' } },

  {
    at: 5200,
    do: (w) => {
      patch(w, 'api', { state: 'unread', last: ASK })
      w.messages.api.push({ id: 'a3', kind: 'agent', text: ASK })
      w.phone.notification = { session: 'api', title: 'api migrations · vps', text: ASK }
      w.flash = 'row-api'
    },
  },
  { at: 6300, cursor: both('phone-notification') },
  {
    at: 7300,
    click: true,
    do: (w) => {
      w.phone = { ...w.phone, screen: 'session', session: 'api', notification: null }
      w.open = 'api'
      patch(w, 'api', { state: 'idle' })
    },
  },

  { at: 10200, cursor: both('phone-msg-a3') },
  { at: 10800, click: true, do: (w) => void (w.phone.menu = 'a3') },
  { at: 11300, cursor: both('phone-reply') },
  { at: 11800, click: true, do: (w) => void ((w.phone.menu = null), (w.phone.quote = ASK)) },
  { at: 12100, cursor: both('phone-composer'), type: { text: REPLY, ms: 1500 } },
  { at: 13600, cursor: both('phone-send') },
  {
    at: 14100,
    click: true,
    do: (w) => {
      w.messages.api.push({ id: 'a4', kind: 'you', text: REPLY, quote: ASK })
      w.messages.api.push({ id: 'a5', kind: 'tool', text: 'psql staging -f migrations/0042_add_retry_columns.sql', status: 'running' })
      w.phone = { ...w.phone, quote: null, draft: '' }
      patch(w, 'api', { state: 'working', last: 'Running 0042 on staging' })
      w.flash = 'row-api'
    },
  },

  {
    at: 15700,
    cursor: { wide: 'pane', tall: 'phone-row-worker' },
    do: (w) => {
      w.open = 'research'
      w.phone.screen = 'list'
      w.messages.research.push({ id: 'r3', kind: 'tool', text: 'my_team', status: 'worker · server · idle' })
    },
  },
  {
    at: 17000,
    do: (w) => void w.messages.research.push({ id: 'r4', kind: 'task', text: `send_task(to: "worker") · ${TASK}`, status: 'queued' }),
  },
  { at: 17600, cursor: { wide: 'row-worker', tall: 'phone-row-worker' } },
  {
    at: 18400,
    do: (w) => {
      const task = w.messages.research.find((m) => m.id === 'r4')
      if (task) task.status = 'delivered'
      patch(w, 'worker', { state: 'working', task: 'from research', last: 'Editing src/payments/client.ts' })
      w.messages.worker.push(
        { id: 'w2', kind: 'task', text: `[muxtower task from Payment retries (research)] ${TASK}` },
        { id: 'w3', kind: 'tool', text: 'Edit src/payments/client.ts', status: 'done' },
      )
      w.flash = 'row-worker'
    },
  },

  {
    at: 21200,
    do: (w) => {
      patch(w, 'worker', { state: 'permission', last: 'Bash: npm test -- payments' })
      w.open = 'worker'
      w.messages.worker.push({ id: 'w4', kind: 'tool', text: 'Bash npm test -- payments', status: 'waiting for you' })
      w.phone = { ...w.phone, screen: 'lock', approval: { session: 'worker', tool: 'Bash', command: 'npm test -- payments' } }
      w.flash = 'row-worker'
    },
  },
  { at: 22300, cursor: both('phone-approve') },
  {
    at: 23000,
    click: true,
    do: (w) => {
      w.phone.approval = null
      patch(w, 'worker', { state: 'working', last: 'Running npm test -- payments' })
      const run = w.messages.worker.find((m) => m.id === 'w4')
      if (run) run.status = 'running'
    },
  },
  {
    at: 24300,
    do: (w) => {
      patch(w, 'worker', { state: 'unread', last: 'All 42 payment tests pass.' })
      const run = w.messages.worker.find((m) => m.id === 'w4')
      if (run) run.status = 'done'
      w.messages.worker.push({ id: 'w5', kind: 'agent', text: 'All 42 payment tests pass. A retried charge reuses its idempotency key.' })
    },
  },

  {
    at: 25700,
    cursor: { wide: 'row-fork', tall: 'phone-row-fork' },
    do: (w) => {
      patch(w, 'fork', { hidden: false })
      w.open = 'research'
      w.phone.screen = 'list'
      w.flash = 'row-fork'
    },
  },
  {
    at: 27300,
    cursor: { wide: 'row-side', tall: 'phone-row-side' },
    do: (w) => void (patch(w, 'side', { hidden: false }), (w.flash = 'row-side')),
  },

  { at: 30200, cursor: null, do: (w) => void ((w.map = true), (w.flash = null)) },
]
