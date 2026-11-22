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
  growth: 2, // DOM nodes (outside bounded views) or heap since the page settled
  // Severe (said by the mark by the app's name, not only in Daemons › Diagnostics): bad, and fixed by an action.
  severeHeapMb: 1000, // a phone's browser drops a tab not far past this; a reload frees it
  severeGrowth: 3, // outside bounded views: no normal use triples the page's own elements; a reload resets it
}
const MINUTE_MS = 60_000
const RENDERS_KEPT = 50
const INPUT_WINDOW_MS = 5 * MINUTE_MS
const INPUTS_KEPT = 200
const INTERACTIONS_KEPT = 1000
const LONG_WINDOW_MS = 10 * MINUTE_MS
const SAMPLES_KEPT = 240 // thinned (every other one dropped) when full: hours of a tab's life
const EDGE_SAMPLES = 5 // the median of the last few, for growth
export const MIN_DOM_FOR_GROWTH = 2000 // a small page doubling is no leak
export const MIN_HEAP_FOR_GROWTH_MB = 100
/** The page is measured against itself once settled: a minute after loading, with a session shown (or five
 *  minutes on, whatever it shows), not as first drawn (an empty list, a skeleton). */
export const SETTLE_MS = MINUTE_MS
export const SETTLE_LATEST_MS = 5 * MINUTE_MS
const SLOW_KEPT = 5

/** One key or tap answered (one interaction: its pointerdown, pointerup and click are one), said by the
 *  event whose handlers took longest and where it landed (`describeTarget`: never text). */
export interface Input {
  at: number
  ms: number
  /** keydown, pointerup, click…; null where the browser does not say. */
  type: string | null
  target: string | null
  /** The browser's interaction id (0: not known), and how long its handlers ran, to pick `type`. */
  id: number
  work: number
}
export type SlowInput = Pick<Input, 'at' | 'ms' | 'type' | 'target'>

const frames: { at: number; bytes: number }[] = []
const renders: number[] = []
const inputs: Input[] = []
const interactions: number[] = [] // when, for each key or tap (`countInteraction`)
const longFrames: { at: number; ms: number }[] = []
export interface Sample {
  at: number
  dom: number
  /** Of `dom`, those in views that keep a bounded history (`data-bounded`: a terminal's scrollback, up to
   *  2,000 lines; a conversation, up to 400 items): they grow by design, so growth is measured without them. */
  bounded: number
  heapMb: number | null
}
/** The page measured now, and what `sample` needs to tell whether it has settled. */
export interface PageSize {
  dom: number
  bounded: number
  heapMb: number | null
  /** Since the page was loaded, ms. */
  age: number
  /** A session page is shown (`data-component="session"`). */
  session: boolean
}
const samples: Sample[] = []
let baseline: Sample | null = null
let renderer: { name: string; software: boolean } | null = null

/** Whether the browser draws without its GPU (it lost it, or never had it): then everything the page
 *  repaints costs the CPU, and only restarting the browser (not reloading the page) brings the GPU back. */
export function softwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render driver|microsoft basic/i.test(name)
}

/** The GPU the browser draws with, as WebGL names it (checked now and then: a GPU can be lost later). */
export function checkRenderer(name = rendererName()) {
  renderer = name === null ? null : { name, software: softwareRenderer(name) }
}

function rendererName(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return 'none (WebGL unavailable: software)'
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext() // let it go at once
    return name
  } catch {
    return null
  }
}

export function countFrame(bytes: number, at = Date.now()) {
  frames.push({ at, bytes })
  while (frames.length && at - frames[0].at > MINUTE_MS) frames.shift()
}

export function countRender(ms: number) {
  renders.push(ms)
  if (renders.length > RENDERS_KEPT) renders.shift()
}

/** How long a key, a tap or a click took to be answered (to the next paint), in ms: what it was and where
 *  (`what`), one entry per interaction however many events the browser reports for it. */
export function countInput(
  ms: number,
  at = Date.now(),
  what: { type?: string | null; target?: string | null; id?: number; work?: number } = {},
) {
  const entry: Input = { at, ms, type: what.type ?? null, target: what.target ?? null, id: what.id ?? 0, work: what.work ?? 0 }
  const same = entry.id ? inputs.findLast((i) => i.id === entry.id) : undefined
  if (same) {
    same.ms = Math.max(same.ms, entry.ms)
    if (entry.work > same.work) Object.assign(same, { type: entry.type, target: entry.target ?? same.target, work: entry.work })
    return
  }
  inputs.push(entry)
  while (inputs.length > INPUTS_KEPT || (inputs.length && at - inputs[0]!.at > INPUT_WINDOW_MS)) inputs.shift()
}

/** A key or a tap, however fast (only where the browser times the slow ones alone). */
export function countInteraction(at = Date.now()) {
  interactions.push(at)
  while (interactions.length > INTERACTIONS_KEPT || (interactions.length && at - interactions[0]! > INPUT_WINDOW_MS)) interactions.shift()
}

/** A frame (or task) that held the main thread for more than 50 ms. */
export function countLongFrame(ms: number, at = Date.now()) {
  longFrames.push({ at, ms })
  while (longFrames.length && at - longFrames[0]!.at > LONG_WINDOW_MS) longFrames.shift()
}

export function measurePage(): PageSize {
  let bounded = 0
  for (const view of document.querySelectorAll('[data-bounded]')) bounded += view.getElementsByTagName('*').length
  return {
    dom: document.getElementsByTagName('*').length,
    bounded,
    heapMb: heapNow(),
    age: performance.now(),
    session: document.querySelector('[data-component="session"]') !== null,
  }
}

/** The page's size now: its DOM nodes, and its heap where the browser tells (taken every minute). The first
 *  once it has settled is what growth is measured against. */
export function sample(at = Date.now(), size: PageSize = measurePage()) {
  const taken: Sample = { at, dom: size.dom, bounded: size.bounded, heapMb: size.heapMb }
  samples.push(taken)
  if (!baseline && size.age >= SETTLE_MS && (size.session || size.age >= SETTLE_LATEST_MS)) baseline = taken
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
/** How many times over its settled size something is now: the median of the newest samples (taken since)
 *  over the settled one (null until settled and sampled a few times since). */
function growth(of: (s: Sample) => number | null): number | null {
  if (!baseline) return null
  const first = of(baseline)
  const since = samples.filter((s) => s.at >= baseline!.at)
  const known = since.map(of).filter((v): v is number => v !== null)
  if (first === null || first <= 0 || known.length < EDGE_SAMPLES) return null
  return Math.round((median(known.slice(-EDGE_SAMPLES))! / first) * 10) / 10
}
const unbounded = (s: Sample) => s.dom - s.bounded

export interface WebUsage {
  /** When this was taken (ms since the epoch). */
  takenAt: number
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
  /** The slowest of those, newest first: what they were and where (never what was typed or shown). */
  slowInputs: SlowInput[]
  /** Long frames in the last minute, and the share of it they blocked; the worst in the last ten. */
  longFramesPerMinute: number
  blockedShare: number
  longestFrameMs: number | null
  domNodes: number | null
  /** Of them, in views with a bounded history (a terminal's scrollback, a conversation). */
  domBounded: number | null
  /** The rest, times what it was once the page had settled (null: not measured long enough yet). */
  domGrowth: number | null
  /** The rest when the page had settled (null: not yet). */
  domSettled: number | null
  heapGrowth: number | null
  /** Since the page was loaded. */
  ageMs: number
  /** The GPU the browser draws with (null: not known), and whether it is software. */
  renderer: { name: string; software: boolean } | null
}

export function snapshot(now = Date.now()): WebUsage {
  const recent = frames.filter((f) => now - f.at <= MINUTE_MS)
  const recentInputs = inputs.filter((i) => now - i.at <= INPUT_WINDOW_MS)
  const answered = recentInputs.map((i) => i.ms)
  // Those the browser did not time (under 16 ms) count as answered at once.
  const untimed = Math.max(0, interactions.filter((at) => now - at <= INPUT_WINDOW_MS).length - answered.length)
  const all = [...answered, ...Array<number>(untimed).fill(0)]
  const long = longFrames.filter((f) => now - f.at <= MINUTE_MS)
  const worst = longFrames.filter((f) => now - f.at <= LONG_WINDOW_MS).map((f) => f.ms)
  return {
    takenAt: now,
    framesPerMinute: recent.length,
    kbPerMinute: Math.round(recent.reduce((n, f) => n + f.bytes, 0) / 102.4) / 10,
    renderAvgMs: renders.length ? Math.round((renders.reduce((a, b) => a + b, 0) / renders.length) * 10) / 10 : null,
    renderMaxMs: renders.length ? Math.round(Math.max(...renders) * 10) / 10 : null,
    heapMb: heapNow(),
    inputP75Ms: answered.length ? percentile(all, 0.75) : null,
    inputMaxMs: answered.length ? Math.max(...answered) : null,
    inputSlow: answered.filter((ms) => ms > WEB_LIMITS.inputSlowMs).length,
    slowInputs: recentInputs
      .filter((i) => i.ms > WEB_LIMITS.inputSlowMs)
      .slice(-SLOW_KEPT)
      .reverse()
      .map(({ at, ms, type, target }) => ({ at, ms, type, target })),
    longFramesPerMinute: long.length,
    blockedShare: Math.round((long.reduce((n, f) => n + f.ms, 0) / MINUTE_MS) * 100) / 100,
    longestFrameMs: worst.length ? Math.round(Math.max(...worst)) : null,
    domNodes: samples.at(-1)?.dom ?? null,
    domBounded: samples.at(-1)?.bounded ?? null,
    domGrowth: growth(unbounded),
    domSettled: baseline ? unbounded(baseline) : null,
    heapGrowth: growth((s) => s.heapMb),
    ageMs: Math.round(performance.now()),
    renderer,
  }
}

/** For tests. */
export function resetDiagnostics() {
  frames.length = 0
  renders.length = 0
  inputs.length = 0
  interactions.length = 0
  baseline = null
  longFrames.length = 0
  samples.length = 0
  renderer = null
}
