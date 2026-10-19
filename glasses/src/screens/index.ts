/** Routes the current place to its screen, and the system menu to its commands. */
import type { Screen } from '@/display/screen'
import type { Action } from '@/input/gestures'
import type { MenuItem } from '@/platform/port'
import { HOME, current, findSession, type AppState, type Outcome } from '@/state/model'
import { groupAct, groupView } from './group'
import { homeAct, homeView } from './home'
import { replyAct, replyView } from './reply'
import { sessionAct, sessionView } from './session'

export function view(state: AppState, now: number): { screen: Screen; order: string[] | null } {
  if (state.voice) return { screen: replyView(state, state.voice), order: null }
  const place = current(state.nav)
  if (place.screen === 'home') return homeView(state, now)
  if (place.screen === 'group') return groupView(state, place.group, now)
  return { screen: sessionView(state, place.id, now), order: null }
}

export function act(state: AppState, action: Action, now: number): Outcome {
  if (state.voice) return replyAct(state, state.voice, action)
  const place = current(state.nav)
  if (place.screen === 'home') return homeAct(state, action, now)
  if (place.screen === 'group') return groupAct(state, place.group, action, now)
  return sessionAct(state, place.id, action)
}

/** Shown on "tap, then long press". Names stay within the firmware's 32 bytes. */
export const MENU: MenuItem[] = [
  { id: 1, name: 'Deny' },
  { id: 2, name: 'Interrupt' },
  { id: 3, name: 'Continue' },
  { id: 4, name: 'Refresh' },
  { id: 5, name: 'Home' },
]

/** What a quick reply sends ("Continue"). */
export const CONTINUE_TEXT = 'continue'

export function menuAct(state: AppState, item: number): Outcome {
  const { nav } = state
  if (item === 4) return { nav, notice: 'Refreshing…', command: { type: 'refresh' } }
  if (item === 5) return { nav: { ...nav, stack: [HOME], frozen: null, offset: 0, armed: null }, notice: null }
  const place = current(nav)
  const session = place.screen === 'session' ? findSession(state, place.id) : undefined
  if (!session) return { nav, notice: 'Open a session first' }
  if (item === 1) {
    if (!session.needs_attention || !session.pending) return { nav, notice: 'Nothing to deny' }
    return { nav: { ...nav, armed: null }, notice: 'Denying…', command: { type: 'deny', id: session.id } }
  }
  if (item === 2) {
    const keys = session.capabilities.keys
    if (keys.length && !keys.includes('Escape')) return { nav, notice: 'This session cannot be interrupted' }
    return { nav, notice: 'Interrupting…', command: { type: 'input', id: session.id, key: 'Escape' } }
  }
  if (item === 3) return { nav, notice: 'Sending…', command: { type: 'input', id: session.id, text: CONTINUE_TEXT } }
  return { nav }
}
