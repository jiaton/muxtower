import { BEATS, type Beat, DURATION, STEPS, type Step, type Target } from './script'
import { initialWorld, type World } from './world'

/** How long a changed row or control stays highlighted. */
export const FLASH_MS = 1800

/** A frame of the demo: the world, the cursor and the beat, all a pure function of the time. Seeking,
 *  replaying and server rendering are then the same thing as playing. */
export interface Frame {
  t: number
  world: World
  cursor: Target | null
  /** When the cursor last clicked, for the ripple. */
  clickAt: number | null
  beat: Beat
  /** 0 to 1 through the current beat. */
  beatProgress: number
}

export function frameAt(t: number, steps: Step[] = STEPS, beats: Beat[] = BEATS, duration = DURATION): Frame {
  const time = Math.min(Math.max(t, 0), duration)
  const world = initialWorld()
  let cursor: Target | null = null
  let clickAt: number | null = null
  let flashAt = 0
  for (const step of steps) {
    if (step.at > time) break
    const before = world.flash
    step.do?.(world)
    if (world.flash !== before) flashAt = step.at
    if (step.cursor !== undefined) cursor = step.cursor
    if (step.click) clickAt = step.at
    if (step.type) {
      const typed = Math.floor(((time - step.at) / step.type.ms) * step.type.text.length)
      world.phone.draft = step.type.text.slice(0, Math.min(typed, step.type.text.length))
    }
  }
  // A highlight shows what just changed, then fades.
  if (world.flash && time - flashAt > FLASH_MS) world.flash = null
  const index = beatIndexAt(time, beats)
  const beat = beats[index]
  const end = beats[index + 1]?.start ?? duration
  return { t: time, world, cursor, clickAt, beat, beatProgress: (time - beat.start) / (end - beat.start) }
}

export function beatIndexAt(t: number, beats: Beat[] = BEATS): number {
  let index = 0
  beats.forEach((beat, i) => {
    if (beat.start <= t) index = i
  })
  return index
}
