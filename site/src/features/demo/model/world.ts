/** The demo's world: five machines joined to one hub, seven agents on four projects, each already some
 *  way into its work. Everything the stage draws is read from a `World`; the script (`script.ts`)
 *  changes it over time. What it shows follows the app (labels, row lines, how a fork or a side chat
 *  is listed) and the daemon (notification text, what `my_team` and `send_task` return). */
import { sessionsSeed } from './seed'

export type DeviceId = 'nas' | 'server' | 'vps' | 'mac' | 'pc'
export type Agent = 'claude' | 'codex'
/** As the app names how a session was started: by muxtower, found in tmux, or a desktop app's. */
export type Source = 'muxtower' | 'tmux' | 'Desktop app'
export type SessionState = 'working' | 'idle' | 'unread' | 'permission'

export interface Device {
  id: DeviceId
  name: string
  /** What kind of machine it is, as the hub lists it. */
  kind: string
  hub?: boolean
}

export interface Pending {
  tool: string
  command: string
  options: string[]
  /** The option muxtower recommends (0-based). */
  recommended: number
}

export interface Session {
  id: string
  name: string
  device: DeviceId
  /** The folder it runs in, as the app shows it. */
  folder: string
  /** Its repository's name, as the list groups and labels it. */
  home: string
  agent: Agent
  source: Source
  role?: string
  state: SessionState
  last: string
  /** Listed under this session: a fork of it, or (with `sideChat`) a side chat. */
  parent?: string
  sideChat?: boolean
  pending?: Pending | null
  /** Not yet found by the hub: appears when the script reveals it. */
  hidden?: boolean
}

export type MessageKind = 'you' | 'agent' | 'tool' | 'task'

export interface Message {
  id: string
  kind: MessageKind
  text: string
  /** A tool call's name (`Bash`, `muxtower · my_team`), its output under it. */
  tool?: string
  output?: string[]
  /** The part of an agent's reply the owner quoted. */
  quote?: string
}

export interface Notification {
  session: string
  /** As the daemon writes them: the title is the session, the body what happened, then where. */
  title: string
  body: string
  where: string
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
    /** Text selected in a reply (its message id and the text), with Copy and Reply over it. */
    selection: { message: string; text: string } | null
    /** The quote waiting above the message box, and what is typed (`typing` reveals it over time). */
    quote: string | null
    draft: string
  }
  /** A row or control drawn as just changed. */
  flash: string | null
  /** The machines drawn as a map around the hub. */
  map: boolean
  /** The hub is down (its machine restarting): the app reaches the other machines directly. */
  hubDown: boolean
}

export const DEVICES: Device[] = [
  { id: 'nas', name: 'nas', kind: 'Linux · always on', hub: true },
  { id: 'server', name: 'server', kind: 'Linux' },
  { id: 'vps', name: 'vps', kind: 'Linux · cloud' },
  { id: 'mac', name: 'macbook', kind: 'macOS' },
  { id: 'pc', name: 'pc', kind: 'Windows' },
]

export const deviceName = (id: DeviceId) => DEVICES.find((d) => d.id === id)?.name ?? id

/** The world as the demo opens: a fresh copy each time, so replaying starts clean. */
export function initialWorld(): World {
  const { sessions, messages } = sessionsSeed()
  return {
    sessions,
    messages,
    open: 'research',
    phone: { screen: 'lock', session: 'api', notification: null, selection: null, quote: null, draft: '' },
    flash: null,
    map: false,
    hubDown: false,
  }
}

export const sessionById = (world: World, id: string) => world.sessions.find((s) => s.id === id)

/** The line under a session's name, as the app writes it: role · machine · repository · source. */
export const metaOf = (s: Session) => [s.role, deviceName(s.device), s.home, s.source].filter(Boolean).join(' · ')

/** The app's banner while the hub is down, as it words it. */
export const hubDownText = () => {
  const hub = DEVICES.find((d) => d.hub)?.name ?? 'hub'
  const direct = DEVICES.filter((d) => !d.hub).map((d) => d.name)
  return `${hub} unreachable · direct to ${direct.join(', ')}. It switches back when ${hub} answers again.`
}
