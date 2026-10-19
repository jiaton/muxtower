/** One machine's sessions: those needing the owner first, then by last activity. */
import { columns } from '@/display/text'
import type { Screen } from '@/display/screen'
import type { Action } from '@/input/gestures'
import { back, findSession, groupOf, placeKey, push, withCursor, type AppState, type Outcome } from '@/state/model'
import { footerFor, linkLabel } from './chrome'
import { age, stateLabel } from './format'
import { ROW_WIDTH, arrange, draw, move, resolveCursor, type Row } from './list'

const NAME_PX = 300
const STATE_PX = 150

export function groupRows(state: AppState, group: string, now: number): Row[] {
  return state.sessions
    .filter((s) => groupOf(s, state.hubName) === group)
    .sort(
      (a, b) =>
        Number(b.needs_attention) - Number(a.needs_attention) || Date.parse(b.updated_at) - Date.parse(a.updated_at),
    )
    .map((s) => ({
      id: s.id,
      text: columns(
        [`${s.needs_attention ? '! ' : ''}${s.name}`, stateLabel(s.state), age(s.updated_at, now)],
        [NAME_PX, STATE_PX],
        ROW_WIDTH,
      ),
    }))
}

export function groupView(state: AppState, group: string, now: number): { screen: Screen; order: string[] } {
  const arranged = arrange(groupRows(state, group, now), state.nav.frozen ?? undefined)
  const cursor = resolveCursor(arranged.rows, state.nav.cursors[placeKey({ screen: 'group', group })])
  const list = draw(arranged, cursor)
  const count = `${arranged.rows.length} session${arranged.rows.length === 1 ? '' : 's'}`
  return {
    screen: {
      header: columns([`@${group}`, linkLabel(state) ?? count], [NAME_PX + STATE_PX], ROW_WIDTH),
      body: arranged.rows.length ? list.lines : ['No sessions here any more.'],
      footer: footerFor(state, list, 'open'),
    },
    order: arranged.order,
  }
}

export function groupAct(state: AppState, group: string, action: Action, now: number): Outcome {
  const { nav } = state
  const arranged = arrange(groupRows(state, group, now), nav.frozen ?? undefined)
  const cursor = resolveCursor(arranged.rows, nav.cursors[placeKey({ screen: 'group', group })])
  switch (action) {
    case 'up':
    case 'down':
      return { nav: withCursor(nav, move(arranged.rows, cursor, action === 'up' ? -1 : 1)), notice: null }
    case 'select':
      if (!cursor || !findSession(state, cursor)) return { nav }
      return { nav: push(withCursor(nav, cursor), { screen: 'session', id: cursor }), notice: null }
    case 'back':
      return { nav: back(nav), notice: null }
    default:
      return { nav }
  }
}
