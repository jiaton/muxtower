/**
 * How a new screen snapshot lines up with the one on screen. Snapshots are a sliding window over the
 * pane's history: output pushes lines off the top (removeTop), and asking for more history adds older
 * lines on top (insertTop). Knowing which lets the view keep the reader's place without re-rendering.
 */
export interface Alignment {
  removeTop: number
  insertTop: number
}

const WINDOW = 3
const MAX_SHIFT = 2000

function startsAt(haystack: string[], needle: string[], at: number, length: number): boolean {
  for (let i = 0; i < length; i++) if (haystack[at + i] !== needle[i]) return false
  return true
}

export function align(prev: string[], next: string[]): Alignment {
  const length = Math.min(WINDOW, prev.length, next.length)
  if (length === 0) return { removeTop: 0, insertTop: 0 }
  // Lines scrolled off the top: next begins somewhere inside prev.
  for (let k = 0; k <= Math.min(MAX_SHIFT, prev.length - length); k++) {
    if (startsAt(prev, next, k, length)) return { removeTop: k, insertTop: 0 }
  }
  // Older history added on top: prev begins somewhere inside next.
  for (let k = 1; k <= Math.min(MAX_SHIFT * 3, next.length - length); k++) {
    if (startsAt(next, prev, k, length)) return { removeTop: 0, insertTop: k }
  }
  return { removeTop: 0, insertTop: 0 }
}

/** Whether a line of HTML shows nothing but spaces: tags skipped, stopping at the first character shown
 *  (a full line of output is told at once, without copying it). */
function blank(html: string): boolean {
  for (let i = 0; i < html.length; i++) {
    const c = html.charCodeAt(i)
    if (c === 60) {
      const end = html.indexOf('>', i) // '<': a tag, shows nothing
      if (end < 0) return false
      i = end
    } else if (c === 38) {
      if (html.startsWith('&nbsp;', i)) i += 5
      else if (html.startsWith('&#160;', i)) i += 5
      else return false // another entity shows a character
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
  for (let i = start; i < lines.length; ) {
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
