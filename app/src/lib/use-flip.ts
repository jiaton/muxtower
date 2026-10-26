import { useLayoutEffect, useRef, type RefObject } from 'react'

const DURATION_MS = 350

/** Slides the elements marked `data-flip="<key>"` inside `ref` from where they were to where they are
 *  whenever `version` changes (FLIP), e.g. a row moving to another group; new ones fade in, and one
 *  moving down passes over the rest (mark them `relative`). Positions are only taken while the container
 *  is shown, so a list that changed while hidden (a phone showing a session) plays the move when it
 *  shows again. Nothing moves for readers who ask for reduced motion. */
export function useFlip(ref: RefObject<HTMLElement | null>, version: string) {
  const last = useRef<{ version: string; tops: Map<string, number> } | null>(null)

  useLayoutEffect(() => {
    const root = ref.current
    if (!root || root.offsetParent === null) return // not shown: keep the positions it had
    const origin = root.getBoundingClientRect().top // offsets within the list, whatever its scroll
    const items = [...root.querySelectorAll<HTMLElement>('[data-flip]')]
    const tops = new Map(items.map((el) => [el.dataset.flip!, el.getBoundingClientRect().top - origin]))
    const before = last.current
    last.current = { version, tops }
    if (!before || before.version === version || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timing = { duration: DURATION_MS, easing: 'ease-in-out' }
    for (const el of items) {
      if (typeof el.animate !== 'function') break
      const from = before.tops.get(el.dataset.flip!)
      if (from === undefined) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], timing)
        continue
      }
      const dy = from - tops.get(el.dataset.flip!)!
      if (Math.abs(dy) < 1) continue
      const move = el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], timing)
      if (dy < 0) {
        el.style.zIndex = '1'
        move.onfinish = move.oncancel = () => el.style.removeProperty('z-index')
      }
    }
  })
}
