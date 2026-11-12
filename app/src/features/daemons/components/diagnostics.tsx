import { WEB_LIMITS } from '@/lib/diagnostics'
import { useWebUsage } from '@/lib/use-web-usage'

const known = (value: number | null, unit: string) => (value === null ? 'unknown here' : `${value}${unit}`)
const times = (growth: number | null) => (growth === null ? '' : `, ${growth}× since the page was loaded`)
const age = (ms: number) => {
  const minutes = Math.floor(ms / 60_000)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/** What this page costs on this device: what the live streams bring, how long a terminal takes to draw,
 *  how fast it answers keys and taps, how much its main thread is blocked, and its size (elements, the JS
 *  heap where the browser tells) against when it was loaded. */
export function Diagnostics() {
  const web = useWebUsage(2000)
  const rows: [string, string][] = [
    ['Live updates', `${web.framesPerMinute} frame${web.framesPerMinute === 1 ? '' : 's'}, ${web.kbPerMinute} KB in the last minute`],
    [
      'Drawing a terminal screen',
      web.renderAvgMs === null
        ? 'nothing drawn yet'
        : `${web.renderAvgMs} ms on average, ${web.renderMaxMs} ms at most (limit ${WEB_LIMITS.renderMs} ms)`,
    ],
    ['JS heap', known(web.heapMb, ` MB (limit ${WEB_LIMITS.heapMb} MB)`) + times(web.heapGrowth)],
    [
      'Answering keys and taps',
      web.inputP75Ms === null
        ? 'none slow enough to time yet'
        : `${web.inputP75Ms} ms p75, ${web.inputMaxMs} ms at most in the last 5 min (limit ${WEB_LIMITS.inputP75Ms} ms)`,
    ],
    [
      'Main thread blocked',
      `${Math.round(web.blockedShare * 100)}% of the last minute, ${web.longFramesPerMinute} long frame${web.longFramesPerMinute === 1 ? '' : 's'}` +
        (web.longestFrameMs === null ? '' : `; longest ${web.longestFrameMs} ms in 10 min`),
    ],
    ['Page elements', known(web.domNodes, '') + times(web.domGrowth)],
    ['Open for', age(web.ageMs)],
  ]
  return (
    <section className="flex flex-col gap-2" aria-label="Diagnostics">
      <h2 className="text-sm font-medium">Diagnostics</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-fg-muted">{name}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
