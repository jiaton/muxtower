/**
 * What this page costs, measured here: what the live streams bring (frames and bytes in the last minute),
 * how long a terminal takes to draw a new screen, how long the page takes to answer a key or a tap (input
 * latency), how much the main thread was blocked (long frames), and how its DOM and JS heap grew since it
 * was loaded (a slow leak lags long before any absolute limit). Counted in module state, so an event costs
 * a push, not a render; `snapshot()` is read every few seconds where it is shown.
 */

export const WEB_LIMITS = {
  renderMs: 50,
  heapMb: 500,
  inputP75Ms: 100, // the usual interaction-to-next-paint "needs improvement" mark
  inputSlowMs: 300,
  inputSlowCount: 3, // that many this slow in the window: it keeps happening
  blockedShare: 0.2, // of the last minute, in long frames
  growth: 2, // DOM nodes or heap since the page was loaded
}
const MINUTE_MS = 60_000
const RENDERS_KEPT = 50
const INPUT_WINDOW_MS = 5 * MINUTE_MS
const INPUTS_KEPT = 200
const LONG_WINDOW_MS = 10 * MINUTE_MS
const SAMPLE_EVERY_MS = MINUTE_MS
const SAMPLES_KEPT = 240 // thinned (every other one dropped) when full: hours of a tab's life
const EDGE_SAMPLES = 5 // the median of the first and of the last few, for growth
const MIN_DOM_FOR_GROWTH = 2000 // a small page doubling is no leak
const MIN_HEAP_FOR_GROWTH_MB = 100

const frames: { at: number; bytes: number }[] = []
const renders: number[] = []
const inputs: { at: number; ms: number }[] = []
const longFrames: { at: number; ms: number }[] = []
export interface Sample {
  at: number
  dom: number
  heapMb: number | null
}
const samples: Sample[] = []

export function countFrame(bytes: number, at = Date.now()) {
  frames.push({ at, bytes })
  while (frames.length && at - frames[0].at > MINUTE_MS) frames.shift()
}

export function countRender(ms: number) {
  renders.push(ms)
  if (renders.length > RENDERS_KEPT) renders.shift()
}

/** How long a key, a tap or a click took to be answered (to the next paint), in ms. */
export function countInput(ms: number, at = Date.now()) {
  inputs.push({ at, ms })
  while (inputs.length > INPUTS_KEPT || (inputs.length && at - inputs[0]!.at > INPUT_WINDOW_MS)) inputs.shift()
}

/** A frame (or task) that held the main thread for more than 50 ms. */
export function countLongFrame(ms: number, at = Date.now()) {
  longFrames.push({ at, ms })
  while (longFrames.length && at - longFrames[0]!.at > LONG_WINDOW_MS) longFrames.shift()
}

/** The page's size now: its DOM nodes, and its heap where the browser tells (taken every minute). */
export function sample(at = Date.now(), dom = document.getElementsByTagName('*').length, heapMb = heapNow()) {
  samples.push({ at, dom, heapMb })
  if (samples.length > SAMPLES_KEPT) {
    // Thinned, keeping the first ones (the page as loaded) and the newest.
    const kept = samples.filter((_, i) => i < EDGE_SAMPLES || i >= samples.length - EDGE_SAMPLES || i % 2 === 0)
    samples.splice(0, samples.length, ...kept)
  }
}

function heapNow(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  return memory ? Math.round(memory.usedJSHeapSize / 1048576) : null
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)]! : null
}
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]! : null
}
/** How many times over its size at load something is now: the median of the newest samples over the median
 *  of the first (null until there are enough of each). */
function growth(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null)
  if (known.length < EDGE_SAMPLES * 2) return null
  const first = median(known.slice(0, EDGE_SAMPLES))!
  const last = median(known.slice(-EDGE_SAMPLES))!
  return first > 0 ? Math.round((last / first) * 10) / 10 : null
}

export interface WebUsage {
  framesPerMinute: number
  kbPerMinute: number
  renderAvgMs: number | null
  renderMaxMs: number | null
  /** null: this browser does not tell. */
  heapMb: number | null
  /** Answering a key or a tap, over the last few minutes (null: none yet). */
  inputP75Ms: number | null
  inputMaxMs: number | null
  inputSlow: number // over `inputSlowMs`
  /** Long frames in the last minute, and the share of it they blocked; the worst in the last ten. */
  longFramesPerMinute: number
  blockedShare: number
  longestFrameMs: number | null
  domNodes: number | null
  /** Times its size when the page was loaded (null: not measured long enough yet). */
  domGrowth: number | null
  heapGrowth: number | null
  /** Since the page was loaded. */
  ageMs: number
}

export function snapshot(now = Date.now()): WebUsage {
  const recent = frames.filter((f) => now - f.at <= MINUTE_MS)
  const answered = inputs.filter((i) => now - i.at <= INPUT_WINDOW_MS).map((i) => i.ms)
  const long = longFrames.filter((f) => now - f.at <= MINUTE_MS)
  const worst = longFrames.filter((f) => now - f.at <= LONG_WINDOW_MS).map((f) => f.ms)
  return {
    framesPerMinute: recent.length,
    kbPerMinute: Math.round(recent.reduce((n, f) => n + f.bytes, 0) / 102.4) / 10,
    renderAvgMs: renders.length ? Math.round((renders.reduce((a, b) => a + b, 0) / renders.length) * 10) / 10 : null,
    renderMaxMs: renders.length ? Math.round(Math.max(...renders) * 10) / 10 : null,
    heapMb: heapNow(),
    inputP75Ms: percentile(answered, 0.75),
    inputMaxMs: answered.length ? Math.max(...answered) : null,
    inputSlow: answered.filter((ms) => ms > WEB_LIMITS.inputSlowMs).length,
    longFramesPerMinute: long.length,
    blockedShare: Math.round((long.reduce((n, f) => n + f.ms, 0) / MINUTE_MS) * 100) / 100,
    longestFrameMs: worst.length ? Math.round(Math.max(...worst)) : null,
    domNodes: samples.at(-1)?.dom ?? null,
    domGrowth: growth(samples.map((s) => s.dom)),
    heapGrowth: growth(samples.map((s) => s.heapMb)),
    ageMs: Math.round(performance.now()),
  }
}

export interface WebAlert {
  metric: 'render' | 'heap' | 'input' | 'input-slow' | 'blocking' | 'dom-growth' | 'heap-growth'
  value: number
  threshold: number
}

/** What is over its limit here. */
export function webAlerts(usage: WebUsage): WebAlert[] {
  const found: WebAlert[] = []
  const L = WEB_LIMITS
  if (usage.renderAvgMs !== null && usage.renderAvgMs > L.renderMs)
    found.push({ metric: 'render', value: usage.renderAvgMs, threshold: L.renderMs })
  if (usage.heapMb !== null && usage.heapMb > L.heapMb) found.push({ metric: 'heap', value: usage.heapMb, threshold: L.heapMb })
  if (usage.inputP75Ms !== null && usage.inputP75Ms > L.inputP75Ms)
    found.push({ metric: 'input', value: usage.inputP75Ms, threshold: L.inputP75Ms })
  if (usage.inputSlow >= L.inputSlowCount) found.push({ metric: 'input-slow', value: usage.inputSlow, threshold: L.inputSlowMs })
  if (usage.blockedShare > L.blockedShare) found.push({ metric: 'blocking', value: usage.blockedShare, threshold: L.blockedShare })
  const big = usage.domNodes !== null && usage.domNodes >= MIN_DOM_FOR_GROWTH
  if (big && usage.domGrowth !== null && usage.domGrowth >= L.growth)
    found.push({ metric: 'dom-growth', value: usage.domGrowth, threshold: L.growth })
  if (usage.heapGrowth !== null && (usage.heapMb ?? 0) >= MIN_HEAP_FOR_GROWTH_MB && usage.heapGrowth >= L.growth)
    found.push({ metric: 'heap-growth', value: usage.heapGrowth, threshold: L.growth })
  return found
}

let watching = false

/** Starts watching input latency, long frames and the page's size (once; cheap: browser observers and a
 *  sample a minute, nothing per keystroke but where the browser cannot time events itself). */
export function watchPage() {
  if (watching || typeof window === 'undefined') return
  watching = true
  const types = typeof PerformanceObserver === 'undefined' ? [] : PerformanceObserver.supportedEntryTypes
  const INTERACTIONS = new Set(['keydown', 'keyup', 'input', 'beforeinput', 'pointerdown', 'pointerup', 'click', 'compositionstart'])
  if (types.includes('event')) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (INTERACTIONS.has(entry.name)) countInput(Math.round(entry.duration))
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit)
  } else {
    // Safari: from the key to the next frame drawn.
    document.addEventListener(
      'keydown',
      () => {
        const at = performance.now()
        requestAnimationFrame(() => countInput(Math.round(performance.now() - at)))
      },
      { capture: true, passive: true },
    )
  }
  const long = types.includes('long-animation-frame') ? 'long-animation-frame' : types.includes('longtask') ? 'longtask' : null
  if (long)
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) countLongFrame(Math.round(entry.duration))
    }).observe({ type: long, buffered: true })
  setTimeout(() => sample(), 5000)
  setInterval(() => sample(), SAMPLE_EVERY_MS)
}

/** For tests. */
export function resetDiagnostics() {
  frames.length = 0
  renders.length = 0
  inputs.length = 0
  longFrames.length = 0
  samples.length = 0
}
