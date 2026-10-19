/** Home: what needs the owner, inline (longest waiting first), then one row per machine with counts. */
import { columns } from '@/display/text'
import type { Session } from '@/hub/types'
import type { Screen } from '@/display/screen'
import { back, findSession, groupOf, push, withCursor, type AppState, type Outcome } from '@/state/model'
import type { Action } from '@/input/gestures'
import { age, stateLabel } from './format'
import { ROW_WIDTH, arrange, draw, move, resolveCursor, type Row } from './list'
import { footerFor, linkLabel } from './chrome'

const NAME_PX = 250
const MACHINE_PX = 140

const waitingSince = (s: Session) => Date.parse(s.updated_at)

/** Group names in display order: the hub's own machine first, then by name. */
export function groupNames(state: AppState): string[] {
  const names = new Set(state.sessions.map((s) => groupOf(s, state.hubName)))
  return [...names].sort((a, b) => Number(b === state.hubName) - Number(a === state.hubName) || a.localeCompare(b))
}

export function homeRows(state: AppState, now: number): Row[] {
  const waiting = state.sessions.filter((s) => s.needs_attention).sort((a, b) => waitingSince(a) - waitingSince(b))
  const rows: Row[] = waiting.map((s) => ({
    id: `s:${s.id}`,
    text: columns(
      [`! ${s.name}`, `@${groupOf(s, state.hubName)}`, `${stateLabel(s.state)} ${age(s.updated_at, now)}`],
      [NAME_PX, MACHINE_PX],
      ROW_WIDTH,
    ),
  }))
  if (waiting.length) rows.push({ id: 'divider', text: '─────', selectable: false })
  for (const group of groupNames(state)) {
    const members = state.sessions.filter((s) => groupOf(s, state.hubName) === group)
    const needs = members.filter((s) => s.needs_attention).length
    const counts = needs ? `${members.length} · ${needs} need${needs === 1 ? 's' : ''} you` : `${members.length}`
    rows.push({ id: `g:${group}`, text: columns([`@${group}`, counts], [NAME_PX + MACHINE_PX], ROW_WIDTH) })
  }
  return rows
}

export function homeView(state: AppState, now: number): { screen: Screen; order: string[] } {
  const arranged = arrange(homeRows(state, now), state.nav.frozen ?? undefined)
  const cursor = resolveCursor(arranged.rows, state.nav.cursors.home)
  const list = draw(arranged, cursor)
  const waiting = state.sessions.filter((s) => s.needs_attention).length
  const status = linkLabel(state) ?? (waiting ? `${waiting} need${waiting === 1 ? 's' : ''} you` : 'all quiet')
  const body = state.loaded && !arranged.rows.length ? ['No sessions.'] : list.lines
  return {
    screen: { header: columns(['muxtower', status], [NAME_PX + MACHINE_PX], ROW_WIDTH), body, footer: footerFor(state, list, 'open') },
    order: arranged.order,
  }
}

export function homeAct(state: AppState, action: Action, now: number): Outcome {
  const { nav } = state
  const arranged = arrange(homeRows(state, now), nav.frozen ?? undefined)
  const cursor = resolveCursor(arranged.rows, nav.cursors.home)
  switch (action) {
    case 'up':
    case 'down':
      return { nav: withCursor(nav, move(arranged.rows, cursor, action === 'up' ? -1 : 1)), notice: null }
    case 'select': {
      if (!cursor) return { nav }
      const opened = withCursor(nav, cursor)
      if (cursor.startsWith('s:') && findSession(state, cursor.slice(2)))
        return { nav: push(opened, { screen: 'session', id: cursor.slice(2) }), notice: null }
      if (cursor.startsWith('g:')) return { nav: push(opened, { screen: 'group', group: cursor.slice(2) }), notice: null }
      return { nav }
    }
    case 'back':
      return { nav: back(nav), command: { type: 'exit' } }
    default:
      return { nav }
  }
}
