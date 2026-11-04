/** The demo's world: five machines joined to one hub, seven agents on four projects. Everything the
 *  stage draws is read from a `World`; the script (`script.ts`) changes it over time. */

export type DeviceId = 'nas' | 'server' | 'vps' | 'mac' | 'pc'
export type Agent = 'claude' | 'codex'
export type Source = 'tmux' | 'desktop' | 'codex-app'
export type SessionState = 'working' | 'idle' | 'unread' | 'permission'

export interface Device {
  id: DeviceId
  name: string
  /** What kind of machine it is, as the hub lists it. */
  kind: string
  hub?: boolean
}

export interface Session {
  id: string
  title: string
  device: DeviceId
  project: string
  agent: Agent
  source: Source
  role?: string
  state: SessionState
  last: string
  /** Listed under this session: a fork of it, or (with `sideChat`) a side chat. */
  parent?: string
  sideChat?: boolean
  /** The latest task it was sent, shown on its row. */
  task?: string
  /** Not yet seen by the hub: appears when the script reveals it. */
  hidden?: boolean
}

export type MessageKind = 'you' | 'agent' | 'tool' | 'task'

export interface Message {
  id: string
  kind: MessageKind
  text: string
  /** A message of the agent's the owner replied to. */
  quote?: string
  /** A tool call's or task's status line. */
  status?: string
}

export interface Notification {
  session: string
  title: string
  text: string
}

export interface Approval {
  session: string
  tool: string
  command: string
}

export type PhoneScreen = 'lock' | 'list' | 'session'

export interface World {
  sessions: Session[]
  messages: Record<string, Message[]>
  /** The session open on the desktop. */
  open: string
  phone: {
    screen: PhoneScreen
    session: string
    notification: Notification | null
    approval: Approval | null
    /** The message being replied to, and what is typed (`typing` reveals it over time). */
    quote: string | null
    draft: string
    /** The message whose menu (Reply, Copy) is open, after a long press. */
    menu: string | null
  }
  /** A row or control drawn as just changed. */
  flash: string | null
  /** The machines drawn as a map around the hub. */
  map: boolean
}

export const DEVICES: Device[] = [
  { id: 'nas', name: 'nas', kind: 'Linux · always on', hub: true },
  { id: 'server', name: 'server', kind: 'Linux' },
  { id: 'vps', name: 'vps', kind: 'Linux · cloud' },
  { id: 'mac', name: 'macbook', kind: 'macOS' },
  { id: 'pc', name: 'pc', kind: 'Windows' },
]

export const deviceName = (id: DeviceId) => DEVICES.find((d) => d.id === id)?.name ?? id

const SESSIONS: Session[] = [
  {
    id: 'research', title: 'Payment retries', device: 'mac', project: 'acme/shop', agent: 'claude', source: 'desktop',
    role: 'research', state: 'idle', last: 'Agreed: retry a charge 3 times, keyed so it is never taken twice.',
  },
  {
    id: 'worker', title: 'shop', device: 'server', project: 'acme/shop', agent: 'claude', source: 'tmux',
    role: 'worker', state: 'idle', last: 'Ready for the next task.',
  },
  {
    id: 'api', title: 'api migrations', device: 'vps', project: 'acme/api', agent: 'codex', source: 'tmux',
    state: 'working', last: 'Writing 0042_add_retry_columns.sql',
  },
  {
    id: 'web', title: 'web', device: 'pc', project: 'acme/web', agent: 'codex', source: 'codex-app',
    state: 'working', last: 'Rebuilding the usage chart with the new API',
  },
  {
    id: 'infra', title: 'infra', device: 'nas', project: 'acme/infra', agent: 'claude', source: 'tmux',
    state: 'idle', last: 'Backups verified: 14 of 14 restored cleanly.',
  },
  {
    id: 'fork', title: 'Payment retries (fork)', device: 'mac', project: 'acme/shop', agent: 'claude', source: 'desktop',
    state: 'unread', parent: 'research', hidden: true, last: 'Same plan, with a circuit breaker instead.',
  },
  {
    id: 'side', title: 'Why 3 retries?', device: 'mac', project: 'acme/shop', agent: 'claude', source: 'desktop',
    state: 'idle', parent: 'research', sideChat: true, hidden: true, last: 'Most declines that recover do so by the second retry.',
  },
] // prettier-ignore

const MESSAGES: Record<string, Message[]> = {
  api: [
    { id: 'a1', kind: 'you', text: 'Add the retry columns to payments, with a migration.' },
    { id: 'a2', kind: 'tool', text: 'apply_patch migrations/0042_add_retry_columns.sql', status: 'done' },
  ],
  research: [
    { id: 'r1', kind: 'you', text: 'How should the payment client retry?' },
    { id: 'r2', kind: 'agent', text: 'Retry a charge up to 3 times with backoff, keyed so a retry is never taken twice.' },
  ],
  worker: [{ id: 'w1', kind: 'agent', text: 'Ready for the next task.' }],
}

/** The world as the demo opens: a fresh copy each time, so replaying starts clean. */
export function initialWorld(): World {
  return {
    sessions: SESSIONS.map((s) => ({ ...s })),
    messages: Object.fromEntries(Object.entries(MESSAGES).map(([k, v]) => [k, v.map((m) => ({ ...m }))])),
    open: 'research',
    phone: { screen: 'lock', session: 'api', notification: null, approval: null, quote: null, draft: '', menu: null },
    flash: null,
    map: false,
  }
}

export const sessionById = (world: World, id: string) => world.sessions.find((s) => s.id === id)
