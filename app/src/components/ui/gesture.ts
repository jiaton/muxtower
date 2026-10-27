/** What the swipeable components share: telling a sideways swipe from a scroll, and where a released
 *  swipe lands. A finger never moves quite straight, so a swipe is told by its first few pixels and kept
 *  however it drifts after (`axisOf`, `holdScroll`); let go, its speed counts as much as how far it went
 *  (`landing`). */

export const START_PX = 8 // how far a finger moves before the gesture counts as a swipe or a scroll
const SIDEWAYS = 1.2 // a swipe may rise this much per pixel across (about 50°) and still be sideways
const PROJECT_MS = 200 // a released swipe lands where its speed would carry it in this long
const FLICK = 0.3 // px/ms: let go this fast, a swipe goes on its way however short it was
const SPEED_WINDOW_MS = 100

/** The axis of a gesture that moved `dx`, `dy`: undefined until it moved far enough to tell. */
export function axisOf(dx: number, dy: number): 'x' | 'y' | undefined {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < START_PX) return undefined
  return Math.abs(dy) < Math.abs(dx) * SIDEWAYS ? 'x' : 'y'
}

/** The recent positions of a finger along one axis, for its speed when it lets go. */
export class Speed {
  private samples: { t: number; x: number }[] = []

  add(x: number, t = performance.now()) {
    this.samples.push({ t, x })
    while (this.samples.length > 2 && t - this.samples[0]!.t > SPEED_WINDOW_MS) this.samples.shift()
  }

  /** Pixels per millisecond, over the last tenth of a second; 0 for a finger that stopped. */
  get(t = performance.now()): number {
    const first = this.samples[0]
    const last = this.samples.at(-1)
    if (!first || !last || last === first || t - last.t > SPEED_WINDOW_MS) return 0
    return (last.x - first.x) / Math.max(1, last.t - first.t)
  }
}

/** Where a swipe let go at `offset`, moving at `speed`, comes to rest: a flick goes on as far as it
 *  can (±Infinity), a slower one a little ahead, one that stopped where it is. */
export function landing(offset: number, speed: number): number {
  if (Math.abs(speed) >= FLICK) return Math.sign(speed) * Infinity
  return offset + speed * PROJECT_MS
}

/** Keeps the browser from scrolling under a touch while `active()`: once a gesture is a sideways swipe,
 *  a finger drifting up or down must not turn it into a scroll (which would cancel it). The listener is
 *  native and not passive, since React's touch listeners cannot prevent scrolling. */
export function holdScroll(el: HTMLElement, active: () => boolean): () => void {
  const move = (e: TouchEvent) => {
    if (active() && e.cancelable) e.preventDefault()
  }
  el.addEventListener('touchmove', move, { passive: false })
  return () => el.removeEventListener('touchmove', move)
}
