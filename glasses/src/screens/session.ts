/** One session: what it is asking (with its choices) first, then Anthropic's turn summary and the last
 *  reply, paged. Choosing takes two taps: the first picks an option, the second confirms it. */
import { BODY_LINES, TEXT_WIDTH } from '@/display/limits'
import type { Screen } from '@/display/screen'
import { columns, fit, pad, width, wrap } from '@/display/text'
import type { Session } from '@/hub/types'
import type { Action } from '@/input/gestures'
import { back, findSession, placeKey, type AppState, type Nav, type Outcome } from '@/state/model'
import { linkLabel } from './chrome'
import { age, plain, stateLabel } from './format'

const READING = 'read'
const PROMPT_LINES = 4
const STEP = BODY_LINES - 1 // a page keeps one line of the previous one
const MARK = width('> ')
const NAME_PX = 380

interface Choice {
  key: string
  label: string
  line: number
}

interface Layout {
  lines: string[]
  choices: Choice[]
}

/** Options are only offered while the session is actually waiting on them. */
const pendingOf = (s: Session) => (s.needs_attention && s.pending?.options?.length ? s.pending : null)

export function layout(session: Session): Layout {
  const lines: string[] = []
  const choices: Choice[] = []
  const pending = pendingOf(session)
  if (pending) {
    const tool = pending.tool_name && session.state !== 'needs_answer' ? `${pending.tool_name.toUpperCase()}  ` : ''
    const prompt = wrap(`${tool}${pending.detail ?? ''}`, TEXT_WIDTH)
    lines.push(...prompt.slice(0, PROMPT_LINES))
    if (prompt.length > PROMPT_LINES) lines[PROMPT_LINES - 1] = fit(`${lines[PROMPT_LINES - 1]} …`, TEXT_WIDTH)
    for (const option of pending.options ?? []) {
      choices.push({ key: option.key, label: option.label, line: lines.length })
      lines.push(fit(option.label, TEXT_WIDTH - MARK))
    }
    lines.push('')
  }
  const summary = session.summary
  const said = [summary?.needs && `Needs: ${summary.needs}`, summary?.recent ?? summary?.detail].filter(Boolean)
  for (const text of said) lines.push(...wrap(String(text), TEXT_WIDTH))
  const reply = plain(session.last_message ?? '')
  if (said.length && reply) lines.push('')
  lines.push(...wrap(reply, TEXT_WIDTH))
  if (!lines.some((l) => l.trim())) lines.push('Nothing to show yet.')
  return { lines, choices }
}

const keyOf = (id: string) => placeKey({ screen: 'session', id })

/** The chosen option, or READING; with choices on offer and nothing remembered, the first choice. */
function cursorOf(nav: Nav, id: string, choices: Choice[]): string {
  const saved = nav.cursors[keyOf(id)]
  if (saved === READING && choices.length) return READING
  return choices.find((c) => c.key === saved)?.key ?? choices[0]?.key ?? READING
}

export function sessionView(state: AppState, id: string, now: number): Screen {
  const session = findSession(state, id)
  if (!session) return { header: 'Session ended', body: ['This session is gone.'], footer: '2× back' }
  const { lines, choices } = layout(session)
  const cursor = cursorOf(state.nav, id, choices)
  const chosen = choices.find((c) => c.key === cursor)
  // While choosing, the page holds the cursor; while reading, it starts at the reading position.
  const offset = chosen ? Math.max(0, chosen.line - BODY_LINES + 1) : Math.min(state.nav.offset, Math.max(0, lines.length - BODY_LINES))
  const marked = lines.map((line, i) => {
    const choice = choices.find((c) => c.line === i)
    return choice ? pad(choice.key === cursor ? '>' : '', MARK) + line : line
  })
  const body = marked.slice(offset, offset + BODY_LINES)
  const pages = Math.max(1, Math.ceil(Math.max(0, lines.length - BODY_LINES) / STEP) + 1)
  const page = Math.min(pages, Math.ceil(offset / STEP) + 1)
  const armed = choices.find((c) => c.key === state.nav.armed)
  const footer = armed
    ? `tap again: ${armed.label}`
    : (state.notice ?? (chosen ? 'tap choose · 2× back' : `${pages > 1 ? `${page}/${pages} · ` : ''}2× back · menu: reply`))
  const status = linkLabel(state) ?? `${stateLabel(session.state)} ${age(session.updated_at, now)}`
  return { header: columns([session.name, status], [NAME_PX], TEXT_WIDTH), body, footer }
}

export function sessionAct(state: AppState, id: string, action: Action): Outcome {
  const { nav } = state
  const session = findSession(state, id)
  if (action === 'back' || !session) return { nav: action === 'back' ? back(nav) : nav, notice: null }
  const { lines, choices } = layout(session)
  const cursor = cursorOf(nav, id, choices)
  const at = choices.findIndex((c) => c.key === cursor)
  const set = (patch: Partial<Nav>, to = cursor): Outcome => ({
    nav: { ...nav, cursors: { ...nav.cursors, [keyOf(id)]: to }, armed: null, ...patch },
    notice: null,
  })
  const lastOffset = Math.max(0, lines.length - BODY_LINES)

  switch (action) {
    case 'down':
      if (at >= 0 && at < choices.length - 1) return set({}, choices[at + 1].key)
      if (at === choices.length - 1 && at >= 0) return set({ offset: Math.min(STEP, lastOffset) }, READING)
      return set({ offset: Math.min(lastOffset, nav.offset + STEP) })
    case 'up':
      if (at > 0) return set({}, choices[at - 1].key)
      if (at === 0) return set({})
      if (nav.offset > 0) return set({ offset: Math.max(0, nav.offset - STEP) })
      return choices.length ? set({ offset: 0 }, choices[choices.length - 1].key) : set({})
    case 'select': {
      if (at < 0) return { nav }
      if (nav.armed === cursor)
        return {
          nav: { ...nav, armed: null },
          notice: 'Sending…',
          command: { type: 'approve', id, option: cursor },
        }
      return { nav: { ...nav, cursors: { ...nav.cursors, [keyOf(id)]: cursor }, armed: cursor }, notice: null }
    }
    default:
      return { nav }
  }
}
