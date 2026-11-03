/**
 * What this page costs, measured here: what the live streams bring (frames and bytes in the last minute),
 * how long a terminal takes to draw a new screen, and the JS heap (Chrome alone tells). Counted in module
 * state, so a frame costs a push, not a render; `snapshot()` is read every few seconds where it is shown.
 */

export const WEB_LIMITS = { renderMs: 50, heapMb: 500 }
const MINUTE_MS = 60_000
const RENDERS_KEPT = 50

const frames: { at: number; bytes: number }[] = []
const renders: number[] = []

export function countFrame(bytes: number, at = Date.now()) {
  frames.push({ at, bytes })
  while (frames.length && at - frames[0].at > MINUTE_MS) frames.shift()
}

export function countRender(ms: number) {
  renders.push(ms)
  if (renders.length > RENDERS_KEPT) renders.shift()
}

export interface WebUsage {
  framesPerMinute: number
  kbPerMinute: number
  renderAvgMs: number | null
  renderMaxMs: number | null
  /** null: this browser does not tell. */
  heapMb: number | null
}

export function snapshot(now = Date.now()): WebUsage {
  const recent = frames.filter((f) => now - f.at <= MINUTE_MS)
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  return {
    framesPerMinute: recent.length,
    kbPerMinute: Math.round(recent.reduce((n, f) => n + f.bytes, 0) / 102.4) / 10,
    renderAvgMs: renders.length ? Math.round((renders.reduce((a, b) => a + b, 0) / renders.length) * 10) / 10 : null,
    renderMaxMs: renders.length ? Math.round(Math.max(...renders) * 10) / 10 : null,
    heapMb: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
  }
}

export interface WebAlert {
  metric: 'render' | 'heap'
  value: number
  threshold: number
}

/** What is over its limit here. */
export function webAlerts(usage: WebUsage): WebAlert[] {
  const found: WebAlert[] = []
  if (usage.renderAvgMs !== null && usage.renderAvgMs > WEB_LIMITS.renderMs)
    found.push({ metric: 'render', value: usage.renderAvgMs, threshold: WEB_LIMITS.renderMs })
  if (usage.heapMb !== null && usage.heapMb > WEB_LIMITS.heapMb)
    found.push({ metric: 'heap', value: usage.heapMb, threshold: WEB_LIMITS.heapMb })
  return found
}

/** For tests. */
export function resetDiagnostics() {
  frames.length = 0
  renders.length = 0
}
