import { IDS } from './seed'
import { sessionById, type Session, type World } from './world'

/** Something on the stage: an element marked `data-demo="<id>"`, per layout (the wide stage has the
 *  desktop window and the phone, the tall one the phone and a strip of machines). */
export interface Target {
  wide?: string
  tall?: string
}

/** Where to look: the stage dims around it, with a short note beside it. */
export interface Focus extends Target {
  note?: string
}

export interface Step {
  /** Milliseconds from the start of the demo. */
  at: number
  do?: (world: World) => void
  /** Where the cursor goes; null hides it. */
  cursor?: Target | null
  click?: boolean
  /** Where the spotlight goes; null lifts it. */
  focus?: Focus | null
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
const both = (id: string, note?: string): Focus => ({ wide: id, tall: id, note })

const ASK = 'Migration 0042 is written and passes on a copy of production. Run it on staging first?'
const QUOTED = 'Run it on staging first?'
const REPLY = 'Yes, staging first. Then show me the row counts.'
const SHIP = 'Merge it once CI is green.'
const TASK = 'Add retries to the payment client: 3 tries, backoff 200/400/800 ms, the order id as idempotency key. Test each path.'

export const BEATS: Beat[] = [
  {
    id: 'machines',
    title: 'Every machine',
    caption: 'Five machines joined to one hub. Claude Code and Codex on each, four projects, one list.',
    start: 0,
  },
  {
    id: 'notify',
    title: 'Notified',
    caption: 'Codex on the VPS finishes and asks something. Your phone gets a push, and the tap opens that session.',
    start: 4000,
  },
  {
    id: 'reply',
    title: 'Reply',
    caption: 'Select the line you are answering and reply to it. The quote and your answer land in the agent’s prompt.',
    start: 8500,
  },
  {
    id: 'team',
    title: 'Team',
    caption: 'The research agent finds its worker with `my_team` and hands it the plan with `send_task`. The worker gets it as a prompt.',
    start: 16000,
  },
  {
    id: 'working',
    title: 'Working',
    caption: 'No need to watch it. The list shows each agent working, waiting or done, on every machine.',
    start: 25000,
  },
  {
    id: 'forks',
    title: 'Forks',
    caption: 'A fork and a side chat made in Claude desktop are found and filed under the session they came from.',
    start: 30500,
  },
  {
    id: 'down',
    title: 'Hub down',
    caption: 'The NAS restarts. The app goes to each machine directly over its own HTTPS address, and back to the hub once it answers.',
    start: 35500,
  },
  {
    id: 'hub',
    title: 'One hub',
    caption: 'Each machine runs a daemon and dials out to the hub. Your phone talks to the hub over HTTPS. No SSH.',
    start: 42500,
  },
]

export const DURATION = 48000

export const STEPS: Step[] = [
  { at: 300, focus: { wide: 'nav-devices', tall: 'strip', note: 'Five machines, one hub' } },
  { at: 1900, focus: { wide: 'list', tall: 'strip', note: 'Every agent, by machine' } },

  {
    at: 4200,
    focus: both('phone-notification', 'A push from the VPS'),
    do: (w) => {
      patch(w, 'api', { state: 'unread', last: ASK })
      w.messages.api.push({ id: 'a5', kind: 'agent', text: ASK })
      w.phone.notification = { session: 'api', title: 'api', body: `Done: ${ASK}`, where: 'vps · ~/code/api' }
      w.flash = 'row-api'
    },
  },
  { at: 5600, cursor: both('phone-notification') },
  {
    at: 6400,
    click: true,
    focus: both('phone-screen'),
    do: (w) => {
      w.phone = { ...w.phone, screen: 'session', session: 'api', notification: null }
      w.open = 'api'
      patch(w, 'api', { state: 'idle' })
    },
  },

  { at: 8700, cursor: both('phone-msg-a5') },
  {
    at: 9400,
    focus: both('phone-msg-a5', 'Select what you answer'),
    do: (w) => void (w.phone.selection = { message: 'a5', text: QUOTED }),
  },
  { at: 10400, cursor: both('phone-reply') },
  {
    at: 11000,
    click: true,
    focus: both('phone-composer', 'Quoted above the message box'),
    do: (w) => void ((w.phone.selection = null), (w.phone.quote = QUOTED)),
  },
  { at: 11400, cursor: both('phone-composer'), type: { text: REPLY, ms: 1300 } },
  { at: 12900, cursor: both('phone-send') },
  {
    at: 13400,
    click: true,
    cursor: null,
    focus: { wide: 'pane-msg-a6', tall: 'phone-screen', note: 'Typed into its prompt, in tmux on the VPS' },
    do: (w) => {
      w.messages.api.push({ id: 'a6', kind: 'you', text: REPLY, quote: QUOTED })
      w.messages.api.push({ id: 'a7', kind: 'tool', tool: 'Bash', text: 'psql "$STAGING_URL" -f migrations/0042_add_retry_columns.sql' })
      w.phone = { ...w.phone, quote: null, draft: '' }
      patch(w, 'api', { state: 'working', last: 'Running 0042 on staging' })
    },
  },
  {
    at: 14800,
    do: (w) => {
      const run = w.messages.api.find((m) => m.id === 'a7')
      if (run) run.output = ['ALTER TABLE', 'charges: 48,213 rows, 0 changed']
    },
  },

  {
    at: 16200,
    focus: { wide: 'pane-msg-r7', tall: 'phone-row-research', note: 'research asks muxtower who its team is' },
    do: (w) => {
      w.open = 'research'
      w.phone.screen = 'list'
      w.messages.research.push({
        id: 'r7',
        kind: 'tool',
        tool: 'muxtower · my_team',
        text: '',
        output: [
          `You: ${IDS.research} · shop-research · role: research · @macbook · idle · in /Users/dev/code/shop · project acme/shop (from its git remote)`,
          'Your team (1 other session in acme/shop):',
          `- ${IDS.worker} · shop · role: worker · @server · idle · in /home/dev/code/shop`,
        ],
      })
    },
  },
  {
    at: 18600,
    focus: { wide: 'pane-msg-r8', tall: 'phone-row-research', note: 'and hands the plan to the worker' },
    do: (w) =>
      void w.messages.research.push({
        id: 'r8',
        kind: 'tool',
        tool: 'muxtower · send_task',
        text: `to: "worker" · ${TASK}`,
        output: [`Delivered to shop (worker, ${IDS.worker}): it takes it up when it can (Claude Code queues it behind what it is doing).`],
      }),
  },
  {
    at: 21000,
    focus: { wide: 'pane-msg-w5', tall: 'phone-row-worker', note: 'The worker on the server gets it as a prompt' },
    do: (w) => {
      w.open = 'worker'
      w.messages.worker.push({ id: 'w5', kind: 'task', text: `[muxtower task from shop-research (research) · ${IDS.research}] ${TASK}` })
      patch(w, 'worker', { state: 'working', last: 'Editing src/payments/client.ts' })
      w.flash = 'row-worker'
    },
  },
  {
    at: 22400,
    do: (w) => void w.messages.worker.push({ id: 'w6', kind: 'tool', tool: 'Edit', text: 'src/payments/client.ts', output: ['+38 −6'] }),
  },
  {
    at: 23400,
    do: (w) => void w.messages.worker.push({ id: 'w7', kind: 'tool', tool: 'Write', text: 'src/payments/client.test.ts', output: ['+64'] }),
  },

  {
    at: 25200,
    cursor: null,
    focus: { wide: 'group-server', tall: 'phone-group-server', note: 'Working, on the server' },
    do: (w) => {
      patch(w, 'worker', { state: 'working', last: 'Running npm test -- payments' })
      w.messages.worker.push({ id: 'w8', kind: 'tool', tool: 'Bash', text: 'npm test -- payments' })
      w.phone = { ...w.phone, screen: 'list', notification: null }
      w.flash = 'row-worker'
    },
  },
  {
    at: 28000,
    focus: { wide: 'group-server', tall: 'phone-group-server', note: 'Done, and unread' },
    do: (w) => {
      const run = w.messages.worker.find((m) => m.id === 'w8')
      if (run) run.output = ['Tests: 42 passed, 42 total']
      w.messages.worker.push({ id: 'w9', kind: 'agent', text: 'All 42 payment tests pass. A retried charge reuses its idempotency key.' })
      patch(w, 'worker', { state: 'unread', last: 'All 42 payment tests pass.' })
      w.flash = 'row-worker'
    },
  },

  {
    at: 30700,
    focus: { wide: 'group-mac', tall: 'phone-group-mac', note: 'A fork from Claude desktop, under its parent' },
    do: (w) => {
      patch(w, 'fork', { hidden: false })
      w.phone.screen = 'list'
      w.open = 'notes'
      w.flash = 'row-fork'
    },
  },
  {
    at: 33000,
    focus: { wide: 'group-mac', tall: 'phone-group-mac', note: 'A side chat, folded into one line' },
    do: (w) => void (patch(w, 'side', { hidden: false }), (w.flash = 'row-side')),
  },

  {
    at: 35700,
    cursor: null,
    focus: { wide: 'banner', tall: 'phone-banner', note: 'The hub is restarting' },
    do: (w) => void ((w.hubDown = true), (w.phone.screen = 'list'), (w.open = 'worker'), (w.flash = null)),
  },
  { at: 37400, cursor: both('phone-row-worker') },
  { at: 38000, click: true, focus: both('phone-screen'), do: (w) => void (w.phone = { ...w.phone, screen: 'session', session: 'worker' }) },
  { at: 38600, cursor: both('phone-composer'), type: { text: SHIP, ms: 1100 } },
  { at: 39900, cursor: both('phone-send') },
  {
    at: 40300,
    click: true,
    cursor: null,
    focus: { wide: 'pane-msg-w10', tall: 'phone-screen', note: 'Straight to the server. Push waits for the hub' },
    do: (w) => {
      w.messages.worker.push({ id: 'w10', kind: 'you', text: SHIP })
      w.phone.draft = ''
      patch(w, 'worker', { state: 'working', last: 'Waiting for CI on the payments branch' })
    },
  },
  { at: 41900, focus: null, do: (w) => void (w.hubDown = false) },

  { at: 42700, do: (w) => void ((w.map = true), (w.flash = null)) },
]
