/** Lists drawn as text with our own cursor (the SDK list container cannot start on a chosen row).
 *
 *  - The cursor is a row id, not an index: when rows change it stays on the same session.
 *  - While a list is on screen its order is frozen: rows keep their places, rows that appeared since are
 *    added at the end with a marker, and the real order comes back when the screen is entered again.
 *  - The window pages: rows 1–8, 9–16, …; the page is the one holding the cursor. */
import { BODY_LINES, TEXT_WIDTH } from '@/display/limits'
import { fit, pad, width } from '@/display/text'

export interface Row {
  id: string
  /** The row's text, already laid out (columns) for the width left after the cursor mark. */
  text: string
  selectable?: boolean
}

const CURSOR = '>'
const FRESH = '•'
const MARK_WIDTH = width(`${CURSOR} `)
export const ROW_WIDTH = TEXT_WIDTH - MARK_WIDTH

export interface Arranged {
  rows: Row[]
  /** Rows not in the frozen order: new since the screen was entered. */
  fresh: Set<string>
  order: string[]
}

export function arrange(rows: Row[], frozen: string[] | undefined): Arranged {
  if (!frozen) return { rows, fresh: new Set(), order: rows.map((r) => r.id) }
  const byId = new Map(rows.map((r) => [r.id, r]))
  const kept = frozen.flatMap((id) => byId.get(id) ?? [])
  const added = rows.filter((r) => !frozen.includes(r.id))
  return { rows: [...kept, ...added], fresh: new Set(added.map((r) => r.id)), order: [...frozen, ...added.map((r) => r.id)] }
}

const selectable = (rows: Row[]) => rows.filter((r) => r.selectable !== false)

/** The cursor's row id: the remembered one if it is still listed, else the first selectable row. */
export function resolveCursor(rows: Row[], cursor: string | undefined): string | undefined {
  const choices = selectable(rows)
  return choices.find((r) => r.id === cursor)?.id ?? choices[0]?.id
}

/** The selectable row `delta` steps away; stops at the ends. */
export function move(rows: Row[], cursor: string | undefined, delta: number): string | undefined {
  const choices = selectable(rows)
  const at = Math.max(0, choices.findIndex((r) => r.id === cursor))
  return choices[Math.min(choices.length - 1, Math.max(0, at + delta))]?.id
}

export interface ListWindow {
  lines: string[]
  page: number
  pages: number
}

export function draw(arranged: Arranged, cursor: string | undefined, height = BODY_LINES): ListWindow {
  const { rows, fresh } = arranged
  const at = Math.max(0, rows.findIndex((r) => r.id === cursor))
  const pages = Math.max(1, Math.ceil(rows.length / height))
  const page = Math.floor(at / height)
  const lines = rows.slice(page * height, (page + 1) * height).map((row) => {
    const mark = row.id === cursor ? CURSOR : fresh.has(row.id) ? FRESH : ''
    return pad(mark, MARK_WIDTH) + fit(row.text, ROW_WIDTH)
  })
  return { lines, page: page + 1, pages }
}
