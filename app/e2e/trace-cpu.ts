// Main-thread CPU time from a Chrome trace (CDP Tracing): what a click cost the page from its first input
// event to the paint that showed its result. CPU time (a task's `tdur`), not wall clock: the same on a
// loaded machine as on an idle one, give or take the cache.
import type { CDPSession } from '@playwright/test'

export interface TraceEvent {
  name: string
  cat: string
  ph: string
  ts: number
  dur?: number
  tdur?: number
  pid: number
  tid: number
  id?: string
  args?: { data?: Record<string, unknown>; name?: string } & Record<string, unknown>
}

const CATEGORIES = [
  'toplevel',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'blink.user_timing',
  'v8.execute',
  'disabled-by-default-v8.cpu_profiler',
]

/** Starts a trace; `stop` ends it and gives its events. */
export async function startTrace(cdp: CDPSession, sampling = false): Promise<() => Promise<TraceEvent[]>> {
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: sampling ? CATEGORIES : CATEGORIES.filter((c) => !c.includes('cpu_profiler')),
      excludedCategories: ['*'],
    },
  })
  const events: TraceEvent[] = []
  const onData = (e: { value: object[] }) => void events.push(...(e.value as TraceEvent[]))
  cdp.on('Tracing.dataCollected', onData)
  return async () => {
    const done = new Promise<void>((resolve) => cdp.once('Tracing.tracingComplete', () => resolve()))
    await cdp.send('Tracing.end')
    await done
    cdp.off('Tracing.dataCollected', onData)
    return events
  }
}

/** The page's main thread: where its input events were dispatched. */
function mainThread(events: TraceEvent[]): { pid: number; tid: number } {
  const names = events.filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
  const counts = new Map<string, number>()
  for (const e of events)
    if (e.name === 'EventDispatch' && names.some((n) => n.pid === e.pid && n.tid === e.tid))
      counts.set(`${e.pid}:${e.tid}`, (counts.get(`${e.pid}:${e.tid}`) ?? 0) + 1)
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? `${names[0]?.pid}:${names[0]?.tid}`
  const [pid, tid] = best.split(':').map(Number) as [number, number]
  return { pid, tid }
}

export interface Interaction {
  /** Main-thread CPU (ms) from the task that took the first input event to the end of the paint that
   *  showed the result (`performance.mark(resultMark)`), every task in between counted. */
  toPaint: number
  /** The same span in wall-clock ms (indicative only). */
  wallToPaint: number
  /** Main-thread CPU (ms) from that first task until the end of the window: everything the click set off. */
  total: number
  /** Tasks over 50 ms (CPU) in the window: [ms, what ran]. */
  longTasks: [number, string][]
  /** CPU (ms) by kind of work, within `toPaint`. */
  kinds: Record<string, number>
  /** The tasks from the first input to that paint: [ms after the start, CPU ms, what ran (its longest
   *  event), whether the result mark is in it]. */
  tasks: [number, number, string, boolean][]
  /** Where it was in the trace (µs): from the first input's task to the end of that paint. */
  span: [number, number]
  /** No result mark in the window (the result never showed, or showed before the click). */
  missing?: boolean
}

const KIND: Record<string, string> = {
  FunctionCall: 'script',
  EventDispatch: 'script',
  TimerFire: 'script',
  FireAnimationFrame: 'script',
  RunMicrotasks: 'script',
  'v8.callFunction': 'script',
  EvaluateScript: 'script',
  UpdateLayoutTree: 'style',
  RecalculateStyles: 'style',
  Layout: 'layout',
  PrePaint: 'paint',
  Paint: 'paint',
  Layerize: 'paint',
  Commit: 'paint',
  UpdateLayer: 'paint',
  MinorGC: 'gc',
  MajorGC: 'gc',
  'V8.GC_SCAVENGER': 'gc',
  ParseHTML: 'parse',
}

/**
 * Splits a trace into interactions, one per input event of type `anchor` (e.g. `click`), each measured to
 * the first paint after its result mark (`resultMark`, the n-th one for the n-th interaction). `inputs`: the
 * event types that start one (the press before a click).
 */
export function interactions(
  events: TraceEvent[],
  { anchor, inputs, resultMark }: { anchor: string; inputs: string[]; resultMark: string },
): Interaction[] {
  const { pid, tid } = mainThread(events)
  const on = events.filter((e) => e.pid === pid && e.tid === tid)
  // Outermost tasks only: a nested run loop's tasks are inside another's time.
  const tasks: TraceEvent[] = []
  for (const t of on.filter((e) => e.ph === 'X' && e.name === 'ThreadControllerImpl::RunTask').sort((a, b) => a.ts - b.ts)) {
    const last = tasks.at(-1)
    if (last && t.ts < last.ts + (last.dur ?? 0)) continue
    tasks.push(t)
  }
  const taskAt = (ts: number) => tasks.find((t) => t.ts <= ts && ts <= t.ts + (t.dur ?? 0))
  const dispatches = on.filter((e) => e.name === 'EventDispatch').sort((a, b) => a.ts - b.ts)
  const typeOf = (e: TraceEvent) => String(e.args?.data?.type ?? '')
  const anchors = dispatches.filter((e) => typeOf(e) === anchor)
  const marks = on
    .filter((e) => e.name === resultMark && (e.ph === 'R' || e.ph === 'I' || e.ph === 'n' || e.ph === 'b' || e.ph === 'X'))
    .sort((a, b) => a.ts - b.ts)
  // Paint ends: the main thread's Paint (or, where compositing paints elsewhere, its Commit).
  const paints = on.filter((e) => e.ph === 'X' && (e.name === 'Paint' || e.name === 'Commit')).sort((a, b) => a.ts - b.ts)
  const out: Interaction[] = []
  // Each interaction from the task that took its first input: the earliest press within 300 ms before the
  // anchor; it ends where the next one starts.
  const starts = anchors.map((a) => {
    const first = dispatches.find((d) => inputs.includes(typeOf(d)) && d.ts <= a.ts && a.ts - d.ts < 300_000) ?? a
    return (taskAt(first.ts) ?? first).ts
  })
  anchors.forEach((a, i) => {
    const next = starts[i + 1] ?? Infinity
    const start = starts[i]!
    const mark = marks.find((m) => m.ts >= start && m.ts < next)
    const anchorTask = taskAt(a.ts) ?? a
    const after = Math.max(mark?.ts ?? 0, anchorTask.ts + (anchorTask.dur ?? 0))
    const paint = paints.find((p) => p.ts >= after && p.ts < next)
    const end = paint ? paint.ts + (paint.dur ?? 0) : after
    const within = (from: number, to: number) => tasks.filter((t) => t.ts >= from && t.ts < to)
    const cpu = (list: TraceEvent[]) => list.reduce((s, t) => s + (t.tdur ?? t.dur ?? 0), 0) / 1000
    const spanTasks = within(start, end)
    const windowEnd = Math.min(next, start + 1_500_000)
    const kinds: Record<string, number> = {}
    // Kinds by self time: each event's tdur minus its nested known events', counted once.
    const known = on
      .filter((e) => e.ph === 'X' && KIND[e.name] && e.ts >= start && e.ts < end)
      .sort((x, y) => x.ts - y.ts || (y.dur ?? 0) - (x.dur ?? 0))
    const stack: TraceEvent[] = []
    const self = new Map<TraceEvent, number>()
    for (const e of known) {
      while (stack.length && stack.at(-1)!.ts + (stack.at(-1)!.dur ?? 0) <= e.ts) stack.pop()
      const parent = stack.at(-1)
      const t = (e.tdur ?? e.dur ?? 0) / 1000
      self.set(e, (self.get(e) ?? 0) + t)
      if (parent) self.set(parent, (self.get(parent) ?? 0) - t)
      stack.push(e)
    }
    for (const [e, t] of self) kinds[KIND[e.name]!] = (kinds[KIND[e.name]!] ?? 0) + t
    for (const k of Object.keys(kinds)) kinds[k] = Math.round(kinds[k]! * 10) / 10
    const long = within(start, windowEnd)
      .filter((t) => (t.tdur ?? 0) > 50_000)
      .map((t): [number, string] => {
        const inner = on
          .filter((e) => e.ts >= t.ts && e.ts < t.ts + (t.dur ?? 0) && e.ph === 'X' && KIND[e.name] === 'script')
          .sort((x, y) => (y.dur ?? 0) - (x.dur ?? 0))[0]
        const what = inner ? `${inner.name}${inner.args?.data?.type ? ` ${String(inner.args.data.type)}` : ''}` : t.name
        return [Math.round((t.tdur ?? 0) / 1000), what]
      })
    out.push({
      toPaint: Math.round(cpu(spanTasks) * 10) / 10,
      wallToPaint: Math.round((end - start) / 100) / 10,
      total: Math.round(cpu(within(start, windowEnd)) * 10) / 10,
      longTasks: long,
      kinds,
      span: [start, end],
      tasks: spanTasks.map((t): [number, number, string, boolean] => {
        const inner = on
          .filter((e) => e.ts >= t.ts && e.ts < t.ts + (t.dur ?? 0) && e.ph === 'X' && KIND[e.name])
          .sort((x, y) => (y.dur ?? 0) - (x.dur ?? 0))[0]
        const what = inner ? `${inner.name}${inner.args?.data?.type ? ` ${String(inner.args.data.type)}` : ''}` : t.name
        const marked = !!mark && mark.ts >= t.ts && mark.ts < t.ts + (t.dur ?? 0)
        return [Math.round((t.ts - start) / 100) / 10, Math.round((t.tdur ?? 0) / 100) / 10, what, marked]
      }),
      ...(mark ? {} : { missing: true }),
    })
  })
  return out
}

/** CPU samples (the profiling build: unminified names) within [from, to] µs, as inclusive ms per function. */
export function callTree(events: TraceEvent[], spans: [number, number][]): Map<string, number> {
  const nodes = new Map<number, { name: string; parent?: number }>()
  const samples: { ts: number; node: number }[] = []
  let profileStart = 0
  for (const e of events) {
    if (e.name === 'Profile') profileStart = Number((e.args?.data as { startTime?: number })?.startTime ?? profileStart)
    if (e.name !== 'ProfileChunk') continue
    const data = e.args?.data as {
      cpuProfile?: { nodes?: { id: number; parent?: number; callFrame: { functionName: string; url?: string } }[]; samples?: number[] }
      timeDeltas?: number[]
    }
    for (const n of data.cpuProfile?.nodes ?? []) nodes.set(n.id, { name: n.callFrame.functionName || '(anonymous)', parent: n.parent })
    let t = samples.at(-1)?.ts ?? profileStart
    ;(data.cpuProfile?.samples ?? []).forEach((id, i) => {
      t += data.timeDeltas?.[i] ?? 0
      samples.push({ ts: t, node: id })
    })
  }
  const inclusive = new Map<string, number>()
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]!
    if (!spans.some(([a, b]) => s.ts >= a && s.ts < b)) continue
    const dt = (s.ts - samples[i - 1]!.ts) / 1000
    // Self time too, as "self <name>": where the time is spent, not only under what.
    const own = `self ${nodes.get(s.node)?.name ?? '?'}`
    inclusive.set(own, (inclusive.get(own) ?? 0) + dt)
    const seen = new Set<string>()
    for (let n: number | undefined = s.node; n !== undefined; n = nodes.get(n)?.parent) {
      const name = nodes.get(n)?.name ?? '?'
      if (seen.has(name)) continue
      seen.add(name)
      inclusive.set(name, (inclusive.get(name) ?? 0) + dt)
    }
  }
  return inclusive
}
