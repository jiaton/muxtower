import { MIN_DOM_FOR_GROWTH, MIN_HEAP_FOR_GROWTH_MB, WEB_LIMITS, type SlowInput, type WebUsage } from './diagnostics'

export interface WebAlert {
  metric: 'render' | 'heap' | 'input' | 'input-slow' | 'blocking' | 'dom-growth' | 'heap-growth' | 'gpu'
  value: number
  threshold: number
  /** Bad and fixed by an action (reload, restart the browser): said by the mark by the app's name. The rest
   *  is said only in Daemons › Diagnostics. */
  severe: boolean
  /** The slowest key or tap, for `input-slow`. */
  slowest?: SlowInput
  /** The GPU's name as WebGL gives it, for `gpu`. */
  renderer?: string
}

/** The condition an alert is about, to dismiss it once: a lost GPU by its renderer (it lasts across reloads,
 *  until the browser restarts); anything else for this page's life (a reload starts it afresh). */
export function alertKey(alert: WebAlert, load = Math.round(performance.timeOrigin)): string {
  return alert.metric === 'gpu' ? `gpu:${alert.renderer ?? ''}` : `${alert.metric}:${load}`
}

/** "keydown on the message box", "click on a button in the session list": what and where, never content. */
export function inputText(input: Pick<SlowInput, 'type' | 'target'>): string {
  return `${input.type ?? 'a key or tap'}${input.target ? ` on ${input.target}` : ''}`
}

/** What is over its limit here. */
export function webAlerts(usage: WebUsage): WebAlert[] {
  const found: WebAlert[] = []
  const L = WEB_LIMITS
  const add = (metric: WebAlert['metric'], value: number, threshold: number, severe = false) =>
    found.push({ metric, value, threshold, severe })
  if (usage.renderAvgMs !== null && usage.renderAvgMs > L.renderMs) add('render', usage.renderAvgMs, L.renderMs)
  if (usage.heapMb !== null && usage.heapMb > L.heapMb) add('heap', usage.heapMb, L.heapMb, usage.heapMb >= L.severeHeapMb)
  if (usage.inputP75Ms !== null && usage.inputP75Ms > L.inputP75Ms) add('input', usage.inputP75Ms, L.inputP75Ms)
  if (usage.inputSlow >= L.inputSlowCount) {
    add('input-slow', usage.inputSlow, L.inputSlowMs)
    const slowest = [...usage.slowInputs].sort((a, b) => b.ms - a.ms)[0]
    if (slowest) found.at(-1)!.slowest = slowest
  }
  if (usage.blockedShare > L.blockedShare) add('blocking', usage.blockedShare, L.blockedShare)
  const own = usage.domNodes === null ? 0 : usage.domNodes - (usage.domBounded ?? 0)
  if (own >= MIN_DOM_FOR_GROWTH && usage.domGrowth !== null && usage.domGrowth >= L.growth)
    add('dom-growth', usage.domGrowth, L.growth, usage.domGrowth >= L.severeGrowth)
  if (usage.heapGrowth !== null && (usage.heapMb ?? 0) >= MIN_HEAP_FOR_GROWTH_MB && usage.heapGrowth >= L.growth)
    add('heap-growth', usage.heapGrowth, L.growth)
  if (usage.renderer?.software) {
    add('gpu', 0, 0, true)
    found.at(-1)!.renderer = usage.renderer.name
  }
  return found
}
