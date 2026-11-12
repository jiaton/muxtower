import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { FOLD_MS } from '@/components/ui/fold'

function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  for (let at = el?.parentElement ?? null; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at)
    if (overflowY === 'auto' || overflowY === 'scroll') return at
  }
  return null
}

/**
 * Keeps the header a reader clicked where it is on screen while what it holds folds or unfolds: every frame
 * of the fold, the list scrolls by however much the header moved. Near the end of the list there may be no
 * room left to scroll (the browser would clamp it, and the header slide down): `spacer`, an element at the
 * list's end, then gives that room, and is cut again as the reader scrolls up past it, unseen. A sticky group
 * header stuck at the top stays at the top when its group folds.
 */
/** Takes back the room given at the end as far as it is below the view (nothing shown moves). */
function trim(box: HTMLElement, room: HTMLElement | null) {
  const extra = room?.offsetHeight ?? 0
  if (!room || !extra) return
  const below = box.scrollHeight - box.scrollTop - box.clientHeight
  const cut = Math.min(extra, Math.floor(below))
  if (cut > 0) room.style.height = `${extra - cut}px`
}

export function useFoldAnchor(root: RefObject<HTMLElement | null>, spacer: RefObject<HTMLElement | null>) {
  const frame = useRef(0)

  useEffect(() => {
    const box = scrollerOf(root.current)
    if (!box) return
    const onScroll = () => trim(box, spacer.current)
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => box.removeEventListener('scroll', onScroll)
  }, [root, spacer])

  return useCallback(
    (header: HTMLElement) => {
      const box = scrollerOf(root.current)
      const room = spacer.current
      if (!box || !room) return
      const before = header.getBoundingClientRect().top
      const until = performance.now() + FOLD_MS + 60
      cancelAnimationFrame(frame.current)
      const step = () => {
        const moved = header.getBoundingClientRect().top - before
        if (Math.abs(moved) >= 0.5) {
          const target = box.scrollTop + moved
          // Where the content ends (the room included), in the box's scrolled coordinates: to scroll to
          // `target`, it must reach `target` + the view (a list shorter than the view needs that much more).
          const end = room.getBoundingClientRect().bottom - box.getBoundingClientRect().top + box.scrollTop
          const short = target + box.clientHeight - end - parseFloat(getComputedStyle(box).paddingBottom || '0')
          if (short > 0) room.style.height = `${room.offsetHeight + Math.ceil(short)}px`
          box.scrollTop = target
        }
        if (performance.now() < until) frame.current = requestAnimationFrame(step)
        else trim(box, room)
      }
      frame.current = requestAnimationFrame(step)
    },
    [root, spacer],
  )
}
