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
