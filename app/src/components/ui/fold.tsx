import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export const FOLD_MS = 180

const still = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * What a header folds: its height (and opacity) eases to nothing or to all of it when `open` changes, and
 * only it moves; what follows simply follows. Folded, its contents are not kept (unmounted once the fold
 * has played). Clipped only while it plays (`overflow: clip` makes no scroll container). Nothing plays for
 * readers who ask for reduced motion.
 */
export function Fold({
  open,
  still: quiet = false,
  children,
}: {
  open: boolean
  /** This change, at once. */ still?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(open)
  const was = useRef(open)
  const playing = useRef<Animation | null>(null)
  if (open && !mounted) setMounted(true) // opened: in the DOM at once, to grow from nothing

  useLayoutEffect(() => {
    if (was.current === open) return
    was.current = open
    const el = ref.current
    const before = playing.current
    if (before) {
      before.onfinish = before.oncancel = null
      before.cancel()
      playing.current = null
    }
    if (!el || quiet || still() || typeof el.animate !== 'function') {
      if (!open) setMounted(false)
      return
    }
    const height = `${el.scrollHeight}px`
    el.style.overflow = 'clip'
    const frames = [
      { height: '0px', opacity: 0 },
      { height, opacity: 1 },
    ]
    const play = el.animate(open ? frames : frames.reverse(), {
      duration: FOLD_MS,
      easing: 'ease-in-out',
      fill: open ? 'none' : 'forwards',
    })
    playing.current = play
    play.onfinish = () => {
      playing.current = null
      el.style.removeProperty('overflow')
      if (!open) setMounted(false)
    }
  }, [open, quiet])

  return mounted ? <div ref={ref}>{children}</div> : null
}
