/**
 * A sideways wheel told as one step back or on: a mouse's thumb wheel, or Shift with its vertical wheel.
 * Per gesture (wheel events with no pause of `IDLE_MS` between them) the sideways movement adds up; once it
 * passes `STEP_PX` (about one notch), and only while the gesture is clearly sideways (more than twice its
 * vertical movement), it is one step, and nothing more until the wheel rests. So a trackpad's long swipe or
 * its momentum steps once, and a list scrolled on a slant never steps.
 */

export const STEP_PX = 100 // about one notch of a mouse's wheel
export const IDLE_MS = 300 // a pause this long ends the gesture
const SIDEWAYS = 2 // a gesture's sideways movement over its vertical, at least, to count

export interface WheelInput {
  /** Pixels (already turned from lines or pages). */
  dx: number
  dy: number
  shift: boolean
  /** Ms, any clock. */
  at: number
}

export interface SidewaysWheel {
  /** -1 or 1 when this event makes the gesture a step back or on, else 0. */
  feed: (input: WheelInput) => -1 | 0 | 1
}

export function sidewaysWheel(): SidewaysWheel {
  let x = 0
  let y = 0
  let last = -Infinity
  let stepped = false
  return {
    feed({ dx, dy, shift, at }) {
      if (at - last >= IDLE_MS) {
        x = 0
        y = 0
        stepped = false
      }
      last = at
      if (stepped) return 0
      // With Shift the vertical wheel is the sideways one; some browsers hand it over as deltaX already.
      const across = shift ? (dy !== 0 ? dy : dx) : dx
      const along = shift ? (dy !== 0 ? dx : 0) : dy
      x += across
      y += along
      if (Math.abs(x) < STEP_PX || Math.abs(x) <= SIDEWAYS * Math.abs(y)) return 0
      stepped = true
      return x > 0 ? 1 : -1
    },
  }
}
