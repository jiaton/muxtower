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
  /** A multiple-choice prompt answered one question at a time: what was picked so far (kept in memory). */
  draft: Draft | null
}

/** Answers to a session's questions, gathered one question at a time and sent together. */
export interface Draft {
  session: string
  /** The questions these answers belong to: a draft for other questions is dropped. */
  asked: string
  /** The labels picked for each question answered so far, in order. */
  picked: string[][]
  /** The options ticked on the question at hand (a multi-select one). */
  ticked: string[]
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
  /** The residency diagnostic's line (`?diag=1`), shown in the footer when there is no notice. */
  diag: string | null
}

export type Command =
  | { type: 'approve'; id: string; option: string }
  | { type: 'answer'; id: string; answers: string[][] }
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
  draft: null,
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

/** Where a session is listed, as the web app sorts them: with the others, set aside as interrupted (its
 *  machine restarted under it), or not at all (archived or hidden by the owner). */
export type Listing = 'listed' | 'interrupted' | 'archived' | 'hidden'

export const listingOf = (session: Session): Listing =>
  session.interrupted_at ? 'interrupted' : session.archived_at ? 'archived' : session.hidden ? 'hidden' : 'listed'

/** Shown on the glasses at all: archived and hidden sessions are left out of every list, count and launch. */
export const isShown = (session: Session) => {
  const listing = listingOf(session)
  return listing === 'listed' || listing === 'interrupted'
}

/** The group interrupted sessions are set apart in (a key no machine name can take). */
export const INTERRUPTED = ':interrupted'

/** The group a session is listed under: the machine it runs on (local tmux sessions run on the hub), or
 *  the interrupted group. */
export const groupOf = (session: Session, hubName: string) =>
  listingOf(session) === 'interrupted' ? INTERRUPTED : session.machine || hubName

/** A group's name on screen. */
export const groupLabel = (group: string) => (group === INTERRUPTED ? 'Interrupted' : `@${group}`)

/** The owner's assistant session, if the hub runs one: pinned on Home, and the target of voice outside a session. */
export const conciergeOf = (state: AppState) =>
  state.sessions.find((s) => s.role === 'concierge' && listingOf(s) === 'listed')

/** Shown sessions other than the assistant (it has its own row and is not counted in any group). */
export const workers = (state: AppState) => state.sessions.filter((s) => s.role !== 'concierge' && isShown(s))

/** Sessions waiting on the owner: shown ones only (an interrupted session waits on nobody). */
export const needsYou = (sessions: Session[]) =>
  sessions.filter((s) => s.needs_attention && listingOf(s) === 'listed')
