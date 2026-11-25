/**
 * A sideways wheel told as one step back or on: a mouse's thumb wheel, or Shift with its vertical wheel.
 *
 * A gesture is wheel events with no pause of `IDLE_MS` between them. Its first event tells what sends it:
 * - A notched wheel: an event in lines or pages, or pixels of at least `NOTCH_PX` (Chrome turns one notch
 *   into 40 px on macOS, 100 on Windows, 120 on Linux). Each notch is a step, as it comes, unless it follows
 *   the event before by under `NOTCH_GAP_MS` (a stream, or one notch sent twice). Should a small pixel event
 *   follow (a stream after all: a trackpad's hard flick, a smooth-scrolling mouse), the gesture is a stream
 *   from then on, and one that already stepped steps no more.
 * - A stream: a trackpad, or a mouse whose driver smooths its wheel into small pixel steps: the sideways
 *   movement adds up; once it passes `STEP_PX`, it is one step, and nothing more until the wheel rests. So a
 *   long swipe or its momentum steps once.
 * Either way only a sideways movement counts: more than twice the vertical (per notch, or over the stream),
 * so a list scrolled on a slant never steps.
 */

export const STEP_PX = 100 // a stream's sideways movement that makes a step
export const IDLE_MS = 300 // a pause this long ends the gesture
export const NOTCH_PX = 36 // a pixel event this big starts a notched wheel's gesture (macOS: 40 px a notch)
export const NOTCH_GAP_MS = 40 // a notch this soon after the event before is not a step of its own
const SIDEWAYS = 2 // the sideways movement over the vertical, at least, to count

export interface WheelInput {
  /** Pixels (already turned from lines or pages). */
  dx: number
  dy: number
  shift: boolean
  /** Ms, any clock. */
  at: number
  /** The browser gave it in lines or pages: a notched wheel. */
  lines?: boolean
}

export interface SidewaysWheel {
  /** -1 or 1 when this event makes a step back or on, else 0. */
  feed: (input: WheelInput) => -1 | 0 | 1
}

export function sidewaysWheel(): SidewaysWheel {
  let kind: 'notch' | 'stream' | null = null
  let x = 0
  let y = 0
  let last = -Infinity
  let stepped = false
  return {
    feed({ dx, dy, shift, at, lines = false }) {
      const gap = at - last
      last = at
      if (gap >= IDLE_MS) {
        kind = null
        x = 0
        y = 0
        stepped = false
      }
      // With Shift the vertical wheel is the sideways one; some browsers (Chrome on macOS) hand it over as
      // deltaX already.
      const across = shift ? (dy !== 0 ? dy : dx) : dx
      const along = shift ? (dy !== 0 ? dx : 0) : dy
      const size = Math.max(Math.abs(across), Math.abs(along))
      if (kind === null) kind = lines || size >= NOTCH_PX ? 'notch' : 'stream'
      else if (kind === 'notch' && !lines && size > 0 && size < NOTCH_PX) kind = 'stream'
      if (kind === 'notch') {
        if (gap < NOTCH_GAP_MS || across === 0 || Math.abs(across) <= SIDEWAYS * Math.abs(along)) return 0
        stepped = true
        return across > 0 ? 1 : -1
      }
      if (stepped) return 0
      x += across
      y += along
      if (Math.abs(x) < STEP_PX || Math.abs(x) <= SIDEWAYS * Math.abs(y)) return 0
      stepped = true
      return x > 0 ? 1 : -1
    },
  }
}
