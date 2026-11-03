import { WEB_LIMITS } from '@/lib/diagnostics'
import { useWebUsage } from '@/lib/use-web-usage'

const known = (value: number | null, unit: string) => (value === null ? 'unknown here' : `${value}${unit}`)

/** What this page costs on this device: what the live streams bring, how long a terminal takes to draw,
 *  and its JS heap (only Chrome tells). */
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
    ['JS heap', known(web.heapMb, ` MB (limit ${WEB_LIMITS.heapMb} MB)`)],
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
