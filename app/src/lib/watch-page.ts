import { checkRenderer, countInput, countInteraction, countLongFrame, sample } from './diagnostics'
import { describeTarget } from './interaction-target'

const SAMPLE_EVERY_MS = 60_000

let watching = false

/** Starts watching input latency, long frames and the page's size (once; cheap: browser observers, a sample
 *  a minute, and per key or tap only a timestamp pushed by a passive listener). */
export function watchPage() {
  if (watching || typeof window === 'undefined') return
  watching = true
  const types = typeof PerformanceObserver === 'undefined' ? [] : PerformanceObserver.supportedEntryTypes
  if (types.includes('event')) {
    // Only interactions (an id: a key, a tap, a click; not a hover), merged by id. The browser reports only
    // those over 16 ms, so the rest are counted here (`countInteraction`) to keep the p75 honest.
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        if (!entry.interactionId) continue
        countInput(Math.round(entry.duration), Date.now(), {
          type: entry.name,
          target: describeTarget(entry.target),
          id: entry.interactionId,
          work: entry.processingEnd - entry.processingStart,
        })
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit)
    for (const type of ['keydown', 'pointerdown'])
      document.addEventListener(type, () => countInteraction(), { capture: true, passive: true })
  } else {
    // Safari: from the key to the next frame drawn (every key timed: nothing to add).
    document.addEventListener(
      'keydown',
      (e) => {
        const at = performance.now()
        const target = describeTarget(e.target as Node | null)
        requestAnimationFrame(() => countInput(Math.round(performance.now() - at), Date.now(), { type: 'keydown', target }))
      },
      { capture: true, passive: true },
    )
  }
  const long = types.includes('long-animation-frame') ? 'long-animation-frame' : types.includes('longtask') ? 'longtask' : null
  if (long)
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) countLongFrame(Math.round(entry.duration))
    }).observe({ type: long, buffered: true })
  setTimeout(() => {
    sample()
    checkRenderer()
  }, 5000)
  setInterval(() => sample(), SAMPLE_EVERY_MS)
  setInterval(() => checkRenderer(), 10 * SAMPLE_EVERY_MS)
}
