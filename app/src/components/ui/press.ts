import { usePress } from '@react-aria/interactions'
import { useEffect, useRef, type DOMAttributes } from 'react'

/** Still this long, a held key starts repeating (a tap sends it once, on release). */
export const HOLD_MS = 350
export const REPEAT_MS = 110
/** Moved further than this, a press is a scroll or a drag: nothing is sent. */
export const MOVE_PX = 10

/** A key that is pressed, not touched: React Aria's press (`usePress`). A tap sends it once on release, a
 *  scroll starting on it (the browser cancels the press) or a finger that moves sends nothing, and held
 *  still for HOLD_MS it repeats (`repeat`) until let go. The keyboard (Enter, Space) sends it too. Never
 *  takes the focus, so a phone's keyboard stays as it is. */
export function useRepeatPress(fire: () => void, repeat: boolean): DOMAttributes<HTMLElement> {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const held = useRef(false)
  const moved = useRef(false)
  const from = useRef<{ x: number; y: number } | null>(null)
  const latest = useRef(fire)
  latest.current = fire
  const stop = () => clearTimeout(timer.current)
  useEffect(() => stop, [])

  const { pressProps } = usePress({
    preventFocusOnPress: true,
    onPressStart: () => {
      held.current = moved.current = false
      if (!repeat) return
      const again = (delay: number) => {
        timer.current = setTimeout(() => {
          if (moved.current) return
          held.current = true
          latest.current()
          again(REPEAT_MS)
        }, delay)
      }
      again(HOLD_MS)
    },
    onPressEnd: () => {
      stop()
      from.current = null
    },
    onPress: () => {
      if (!held.current && !moved.current) latest.current()
    },
  })
  return {
    ...pressProps,
    onPointerDown: (e) => {
      from.current = { x: e.clientX, y: e.clientY }
      pressProps.onPointerDown?.(e)
    },
    onPointerMove: (e) => {
      pressProps.onPointerMove?.(e)
      const start = from.current
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) {
        moved.current = true // a scroll or a drag, not a press: nothing more is sent
        stop()
      }
    },
  }
}

/** A finger held still on something for `ms` (a mouse has its right click): `onHold` with where it was
 *  held. Moving (a scroll) or the browser cancelling the gesture lets it go; nothing happens on touch-down.
 *  `held()` says whether the last press was a hold, so the click it ends with can be let go. */
export function useHold(ms: number, onHold: (x: number, y: number) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const from = useRef<{ x: number; y: number } | null>(null)
  const was = useRef(false)
  const latest = useRef(onHold)
  latest.current = onHold
  const stop = () => {
    clearTimeout(timer.current)
    from.current = null
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return {
    held: () => was.current,
    release: () => void (was.current = false),
    props: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') return
        was.current = false
        const { clientX: x, clientY: y } = e
        from.current = { x, y }
        clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          was.current = true
          from.current = null
          latest.current(x, y)
        }, ms)
      },
      onPointerMove: (e: React.PointerEvent) => {
        const start = from.current
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) stop() // a scroll
      },
      onPointerUp: stop,
      onPointerCancel: stop,
    },
  }
}

/** A card that takes a tap or a swipe, decided on release: `onTap` (moved under MOVE_PX), or `onSwipe`
 *  (past `swipePx` sideways or down) with how far. A press on a button inside it is that button's, and a
 *  gesture the browser cancels (a scroll) is neither. */
export function useTapOrSwipe(swipePx: number, on: { tap: () => void; swipe: () => void }) {
  const from = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: React.PointerEvent) => {
      from.current = (e.target as Element).closest('button') ? null : { x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const start = from.current
      from.current = null
      if (!start) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.abs(dx) > swipePx || dy > swipePx) on.swipe()
      else if (Math.abs(dx) < MOVE_PX && Math.abs(dy) < MOVE_PX) on.tap()
    },
    onPointerCancel: () => void (from.current = null),
  }
}
