/** What the swipeable components share: telling a sideways swipe from a scroll, and where a released
 *  swipe lands. A finger never moves quite straight, so a swipe is told by its first few pixels and kept
 *  however it drifts after (`axisOf`, `holdScroll`); let go, its speed counts as much as how far it went
 *  (`landing`). */

export const START_PX = 10 // how far a finger moves before the gesture counts as a swipe or a scroll
const SIDEWAYS = 1.2 // a swipe may rise this much per pixel across (about 50°) and still be sideways
const PROJECT_MS = 200 // a released swipe lands where its speed would carry it in this long
const FLICK = 0.4 // px/ms: let go this fast, a swipe goes on its way, short as it may be
const FLICK_PX = 40 // but not one shorter than this (CSS px, about 6 mm on a phone): a twitch
const SPEED_WINDOW_MS = 100
const FRAME_MS = 16
const LAND_SPEED = 1.6 // px/ms: a released swipe lands at least this fast, faster if the finger was
const LAND_MS = [110, 190] as const // and takes no less, and no more, than this
export const LAND_EASE = 'cubic-bezier(0.25, 0.8, 0.25, 1)' // quick to start, easing into place

/** The axis of a gesture that moved `dx`, `dy`: undefined until it moved far enough to tell. */
export function axisOf(dx: number, dy: number): 'x' | 'y' | undefined {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < START_PX) return undefined
  return Math.abs(dy) < Math.abs(dx) * SIDEWAYS ? 'x' : 'y'
}

/** The recent positions of a finger along one axis, for its speed when it lets go. The first is where it
 *  pressed. */
export class Speed {
  private samples: { t: number; x: number }[] = []

  add(x: number, t = performance.now()) {
    const press = this.samples.length === 1 ? this.samples[0]! : undefined
    // A finger held still sends no moves: its first one, long after the press, is a move that began in
    // the frame before it (press, hold, flick), not one spread over the whole hold.
    if (press && t - press.t > 2 * FRAME_MS) press.t = t - FRAME_MS
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

/** Where a swipe let go at `offset`, having `moved` that way, at `speed`, comes to rest: a flick goes on
 *  as far as it can (±Infinity), a slower one a little ahead, one that stopped where it is. A finger
 *  that only twitched (less than FLICK_PX) is where it is, however quick. */
export function landing(offset: number, speed: number, moved: number): number {
  if (Math.abs(moved) < FLICK_PX) return offset
  if (Math.abs(speed) >= FLICK && Math.sign(speed) === Math.sign(moved)) return Math.sign(speed) * Infinity
  return offset + speed * PROJECT_MS
}

/** How long a released swipe takes to land `px` away: at the finger's speed or a brisk one, and briefly
 *  either way, so the next screen is there as the finger lifts. */
export function landMs(px: number, speed = 0): number {
  const ms = Math.abs(px) / Math.max(Math.abs(speed), LAND_SPEED)
  return Math.round(Math.min(LAND_MS[1], Math.max(LAND_MS[0], ms)))
}

const CARRY_MS = [120, 300] as const // a landing that carries the finger's speed on takes this long
const CARRY_X1 = 0.2 // the carried curve's first control point, across (its start)
const STOPPED = 0.15 // px/ms: let go slower than this, the finger had stopped: nothing to carry on

/** How a released swipe lands `px` away, carrying on the finger's `speed` (px/ms): a duration and a
 *  curve whose first slope is that speed, so nothing stalls or jumps as the finger lifts, easing into
 *  place. A finger that had stopped (or let go the other way) lands as `landMs` and LAND_EASE: briskly,
 *  easing out, never easing in. */
export function landCurve(px: number, speed: number): { ms: number; ease: string } {
  const distance = Math.abs(px)
  const toward = Math.sign(speed) === Math.sign(px) || px === 0
  const fast = Math.abs(speed)
  if (!distance || !toward || fast < STOPPED) return { ms: landMs(px, speed), ease: LAND_EASE }
  const ms = Math.round(Math.min(CARRY_MS[1], Math.max(CARRY_MS[0], distance / fast)))
  // The curve's starting slope (progress per unit of time) is y1 / x1: as fast as the finger, relative
  // to the whole landing's average speed (distance / ms). Capped where a bezier can still go.
  const slope = (fast * ms) / distance
  // Never slower than the finger to start (a long way at a slow speed starts a little quicker than it).
  const y1 = Math.min(1, CARRY_X1 * Math.max(1, slope))
  return { ms, ease: `cubic-bezier(${CARRY_X1}, ${y1.toFixed(3)}, 0.2, 1)` }
}

/** Runs `fn` once the browser has drawn the next frame: a landing set off in a touch handler is under
 *  way on the compositor first, and a React render `fn` causes cannot hold up its start. */
export function afterFrame(fn: () => void): void {
  requestAnimationFrame(() => setTimeout(fn, 0))
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

/** A swipe handed on, as it goes, to what it pulls into view (a drawer pulled open by a swipe past a
 *  pager's first page): how far the finger has come, then where it let go and how fast. */
export interface Pull {
  move: (px: number) => void
  end: (px: number, speed: number) => void
}

/** Whether the touch began on something that scrolls sideways itself and can still go the way of `dx`
 *  (a finger moving right scrolls toward the start), up to `root`. */
export function sideways(target: EventTarget | null, root: HTMLElement, dx: number): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth + 1 || !/auto|scroll/.test(getComputedStyle(el).overflowX)) continue
    if (dx > 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true
  }
  return false
}

/** Keeps the focus where it is (a text field, and a phone's keyboard with it) when a control is pressed:
 *  the primary button or a finger only. Another mouse button is left alone, its back and forward above
 *  all, which a pointerdown's default being prevented would cancel. */
export function keepFocus(e: { button: number; preventDefault: () => void }) {
  if (e.button === 0) e.preventDefault()
}
