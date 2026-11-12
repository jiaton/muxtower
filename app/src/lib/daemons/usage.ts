import type { MachineUsage, UsageAlert } from '@/lib/api/types'
import type { WebAlert } from '@/lib/diagnostics'

/** One line for what is over its limit, with its limit. */
export function alertText(alert: UsageAlert | WebAlert): string {
  switch (alert.metric) {
    case 'cpu':
      return `CPU ${alert.value}% of a core over the last minute (limit ${alert.threshold}%)`
    case 'tick':
      return `Reading the screens takes ${alert.value} ms a round (limit ${alert.threshold} ms)`
    case 'memory':
      return `Memory ${alert.value} MB (limit ${alert.threshold} MB)`
    case 'render':
      return `Drawing a terminal screen takes ${alert.value} ms (limit ${alert.threshold} ms)`
    case 'heap':
      return `JS heap ${alert.value} MB (limit ${alert.threshold} MB)`
    case 'input':
      return `Answering a key or a tap takes ${alert.value} ms (p75; limit ${alert.threshold} ms)`
    case 'input-slow':
      return `${alert.value} keys or taps took over ${alert.threshold} ms in the last few minutes`
    case 'blocking':
      return `The page was blocked ${Math.round(alert.value * 100)}% of the last minute (limit ${Math.round(alert.threshold * 100)}%)`
    case 'dom-growth':
      return `The page has ${alert.value}× the elements it had when loaded: reload it (limit ${alert.threshold}×)`
    case 'gpu':
      return 'The browser lost GPU acceleration and draws in software: restart the browser (reloading the page is not enough)'
    case 'heap-growth':
      return `JS heap is ${alert.value}× what it was when loaded: reload it (limit ${alert.threshold}×)`
    default:
      return `${alert.metric}: ${alert.value} (limit ${alert.threshold})`
  }
}

/** A value, or that it cannot be read there: never a made-up 0. */
export const known = (value: number | null | undefined, unit = '') =>
  value === null || value === undefined ? 'unknown' : `${value}${unit}`

/** What one machine's daemon uses, as short parts of a line. */
export function usageParts(usage: MachineUsage): string[] {
  const tick = usage.tick
  return [
    `CPU ${known(usage.cpu_1m, '%')} (10 min ${known(usage.cpu_10m, '%')})`,
    `memory ${known(usage.rss_mb, ' MB')}`,
    `${known(usage.threads)} threads`,
    `${known(usage.open_files)} open files`,
    `screens ${known(tick?.avg_ms, ' ms')} a round (max ${known(tick?.max_ms, ' ms')})`,
  ]
}
