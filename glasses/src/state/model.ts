/** The app's state and the vocabulary screens use to change it. Screens are pure: (state, action) →
 *  outcome; the controller applies the outcome and runs its command against the hub. */
import type { LinkState } from '@/hub/stream'
import type { Session } from '@/hub/types'

export type Place = { screen: 'home' } | { screen: 'group'; group: string } | { screen: 'session'; id: string }

export const HOME: Place = { screen: 'home' }

export const placeKey = (place: Place) =>
  place.screen === 'home' ? 'home' : place.screen === 'group' ? `group:${place.group}` : `session:${place.id}`

export interface Nav {
  stack: Place[]
  /** Cursor per screen (a row id, or an option key on a session); kept across launches. */
  cursors: Record<string, string>
  /** Row order of the list on screen, frozen when it was entered; null until first drawn. */
  frozen: string[] | null
  /** Reading position (first line shown) on a session screen. */
  offset: number
  /** The option a first tap chose; a second tap on it confirms. */
  armed: string | null
  lastOpened: string | null
}

/** A voice reply in progress: recording while held, then the text to confirm before it is sent. */
export interface Voice {
  session: string
  /** `hold`: recording while the press is held; `tap`: from a tap until the next tap. */
  mode: 'hold' | 'tap'
  phase: 'listening' | 'transcribing' | 'ready' | 'failed'
  /** What was heard so far (live while listening), the transcript once ready, the reason once failed. */
  text: string
}

/** What the hub can do beyond the basics (from /v1/me). */
export interface Features {
  summaries: boolean
  asr: boolean
}

export interface AppState {
  link: LinkState | 'unpaired'
  hubName: string
  sessions: Session[]
  /** The first session list has arrived. */
  loaded: boolean
  nav: Nav
  /** One line for the footer: an announcement or the result of the last command. */
  notice: string | null
  voice: Voice | null
  features: Features
}

export type Command =
  | { type: 'approve'; id: string; option: string }
  | { type: 'deny'; id: string }
  | { type: 'input'; id: string; text?: string; key?: string }
  | { type: 'refresh' }
  | { type: 'exit' }

export interface Outcome {
  nav: Nav
  notice?: string | null
  command?: Command
  /** Replaces the voice reply in progress (null ends it); left out, it stays as it is. */
  voice?: Voice | null
  /** Start a tap-to-talk recording, or stop the one running (the controller owns the microphone). */
  listen?: 'start' | 'stop'
}

export const current = (nav: Nav): Place => nav.stack[nav.stack.length - 1] ?? HOME

export const initialNav = (): Nav => ({
  stack: [HOME],
  cursors: {},
  frozen: null,
  offset: 0,
  armed: null,
  lastOpened: null,
})

/** Entering a screen: its order is computed afresh and nothing is armed. */
export function push(nav: Nav, place: Place): Nav {
  const lastOpened = place.screen === 'session' ? place.id : nav.lastOpened
  return { ...nav, stack: [...nav.stack, place], frozen: null, offset: 0, armed: null, lastOpened }
}

export function back(nav: Nav): Nav {
  const stack = nav.stack.length > 1 ? nav.stack.slice(0, -1) : [HOME]
  return { ...nav, stack, frozen: null, offset: 0, armed: null }
}

export const withCursor = (nav: Nav, cursor: string | undefined): Nav =>
  cursor === undefined ? nav : { ...nav, cursors: { ...nav.cursors, [placeKey(current(nav))]: cursor }, armed: null }

export const findSession = (state: AppState, id: string) => state.sessions.find((s) => s.id === id)

/** The group a session is listed under: the machine it runs on (local tmux sessions run on the hub). */
export const groupOf = (session: Session, hubName: string) => session.machine || hubName

/** The owner's assistant session, if the hub runs one: pinned on Home, and the target of voice outside a session. */
export const conciergeOf = (state: AppState) => state.sessions.find((s) => s.role === 'concierge')

/** Sessions other than the assistant (it has its own row and is not counted in any group). */
export const workers = (state: AppState) => state.sessions.filter((s) => s.role !== 'concierge')
