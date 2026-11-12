import { useLayoutEffect, useRef, type RefObject } from 'react'

const MOVE_MS = 350

/**
 * A row that moved to another group or folder (a session that finished, one kept at the end once opened)
 * slides from where it was to where it is now; a new row fades in. Only those: the rows that just follow
 * (one above them went, a folder folded) and the headers are left alone, and sticky headers never get a
 * transform. `placed` says each row's group or folder (`data-row` keys). Positions are only taken while
 * the list is shown, so one that changed while hidden (a phone showing a session) plays when it shows
 * again. Nothing moves for readers who ask for reduced motion.
 */
export function useRowMoves(root: RefObject<HTMLElement | null>, placed: Map<string, string>) {
  const last = useRef<{ placed: Map<string, string>; tops: Map<string, number> } | null>(null)

  useLayoutEffect(() => {
    const list = root.current
    if (!list || list.offsetParent === null) return // not shown: keep what it had
    const origin = list.getBoundingClientRect().top // offsets within the list, whatever its scroll
    const rows = [...list.querySelectorAll<HTMLElement>('[data-row]')]
    const tops = new Map(rows.map((el) => [el.dataset.row!, el.getBoundingClientRect().top - origin]))
    const before = last.current
    last.current = { placed, tops }
    if (!before || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timing = { duration: MOVE_MS, easing: 'ease-in-out' }
    for (const el of rows) {
      if (typeof el.animate !== 'function') break
      const key = el.dataset.row!
      const was = before.placed.get(key)
      if (was === undefined) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], timing) // new here
        continue
      }
      const from = before.tops.get(key)
      if (was === placed.get(key) || from === undefined) continue // still where it was: it just follows
      const dy = from - tops.get(key)!
      if (Math.abs(dy) < 1) continue
      const move = el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], timing)
      el.style.zIndex = '1' // over the rows it passes
      move.onfinish = move.oncancel = () => el.style.removeProperty('z-index')
    }
  })
}
