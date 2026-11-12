/**
 * How a new screen snapshot lines up with the one on screen. Snapshots are a sliding window over the
 * pane's history: output pushes lines off the top (removeTop), and asking for more history adds older
 * lines on top (insertTop). Knowing which lets the view keep the reader's place without re-rendering.
 */
export interface Alignment {
  removeTop: number
  insertTop: number
}

const MAX_SHIFT = 2000
const ANCHOR_SEARCH = 60 // lines from the top in which to find a line to anchor on
const MAX_CANDIDATES = 40
const COMPARED = 300 // lines compared to score an offset
const SURE = 0.6 // of the lines compared, how many must match for an offset to be taken

const TAG = /<[^>]*>/g
const RULE = /^[\s\u2500-\u257f\u2580-\u259f\-_=~·•.…*]*$/ // box drawing, blocks, dashes: a rule or a frame
/** A line that tells one place in the output from another: not blank, not a rule. */
function telling(html: string): boolean {
  const text = html.replace(TAG, '').replace(/&nbsp;/g, ' ')
  return !RULE.test(text)
}

/** How many of the lines that overlap match, from `a[shift]` against `b[0]`, as a share. */
function score(a: string[], b: string[], shift: number): number {
  const overlap = Math.min(a.length - shift, b.length, COMPARED)
  if (overlap <= 0) return 0
  let same = 0
  for (let i = 0; i < overlap; i++) if (a[shift + i] === b[i]) same++
  return same / overlap
}

/** The offsets at which `within` holds the first telling line of `of` (near its top), as shifts of `of`. */
function candidates(of: string[], within: string[], max: number): number[] {
  const j = of.slice(0, ANCHOR_SEARCH).findIndex(telling)
  if (j < 0) return []
  const found: number[] = []
  for (let p = 0; p < within.length && found.length < MAX_CANDIDATES; p++) {
    if (within[p] === of[j] && p - j >= 0 && p - j <= max) found.push(p - j)
  }
  return found
}

/**
 * Which shift lines the new snapshot up with the old: matched on a line that tells places apart (blank
 * lines and rules repeat all over an agent's output, and matching on them put the view at the wrong place),
 * each possible shift scored by how much of the overlap then matches. Taken only when one is clearly best;
 * when unsure, no shift (the lines are redrawn where they are, and the reader's place is not moved).
 */
export function align(prev: string[], next: string[]): Alignment {
  if (!prev.length || !next.length) return { removeTop: 0, insertTop: 0 }
  const scored: { at: Alignment; score: number }[] = []
  // Lines scrolled off the top: next begins somewhere inside prev (0: in place).
  for (const k of new Set([0, ...candidates(next, prev, MAX_SHIFT)]))
    scored.push({ at: { removeTop: k, insertTop: 0 }, score: score(prev, next, k) })
  // Older history added on top: prev begins somewhere inside next.
  for (const k of candidates(prev, next, MAX_SHIFT * 3))
    if (k > 0) scored.push({ at: { removeTop: 0, insertTop: k }, score: score(next, prev, k) })
  scored.sort((a, b) => b.score - a.score)
  const [best, second] = scored
  if (!best || best.score < SURE || (second && second.score === best.score)) return { removeTop: 0, insertTop: 0 }
  return best.at
}

/** Whether a line of HTML shows nothing but spaces: tags skipped, stopping at the first character shown
 *  (a full line of output is told at once, without copying it). An entity (`&amp;`, `&lt;`…: what
 *  `lib/ansi.ts` escapes) shows a character. */
function blank(html: string): boolean {
  for (let i = 0; i < html.length; i++) {
    const c = html.charCodeAt(i)
    if (c === 60) {
      const end = html.indexOf('>', i) // '<': a tag, shows nothing
      if (end < 0) return false
      i = end
    } else if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 160) return false
  }
  return true
}

/**
 * A pane taller than the view (Height 2x, 3x) shows a freshly started full-screen agent with its header at
 * the top, its input box at the bottom and screens of blank lines between: within the pane's own screen
 * (its last `paneRows` lines; what is above is history), the longest run of blank lines is shortened until
 * that screen fits the view (`viewRows`), keeping at least one, so both ends show. As output fills the pane
 * the run shrinks and nothing is shortened any more; a pane no taller than the view is never touched.
 */
export function collapseGap(lines: string[], viewRows: number | undefined, paneRows: number | undefined): string[] {
  if (!viewRows || !paneRows || paneRows <= viewRows) return lines
  const start = Math.max(0, lines.length - paneRows)
  const screen = lines.length - start
  if (screen <= viewRows) return lines
  let best = { at: -1, length: 0 }
  for (let i = start; i < lines.length;) {
    if (!blank(lines[i])) {
      i++
      continue
    }
    let j = i
    while (j < lines.length && blank(lines[j])) j++
    if (j - i > best.length) best = { at: i, length: j - i }
    i = j
  }
  const cut = Math.min(best.length - 1, screen - viewRows)
  if (cut <= 0) return lines
  return [...lines.slice(0, best.at), ...lines.slice(best.at + cut)]
}
