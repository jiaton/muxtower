import type { ReactNode } from 'react'
import { alertText } from '@/lib/daemons/usage'
import { WEB_LIMITS } from '@/lib/diagnostics'
import { inputText, webAlerts } from '@/lib/diagnostics-alerts'
import { useWebUsage } from '@/lib/use-web-usage'
import { ink } from '@/components/ui/intents'

const known = (value: number | null, unit: string) => (value === null ? 'unknown here' : `${value}${unit}`)
const times = (growth: number | null) => (growth === null ? '' : `, ${growth}× since the page settled`)
const ago = (at: number, now: number) => {
  const s = Math.max(0, Math.round((now - at) / 1000))
  return s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`
}
const age = (ms: number) => {
  const minutes = Math.floor(ms / 60_000)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/** What this page costs on this device: what the live streams bring, how long a terminal takes to draw,
 *  how fast it answers keys and taps (the slow ones: what and where), how much its main thread is blocked,
 *  and its size (elements, the JS heap where the browser tells) against when it had settled. What is over a
 *  limit is said here first; only the severe reaches the mark by the app's name (`WebUsageMark`). Other
 *  features add their own below (`extra`: the push log). */
export function Diagnostics({ extra }: { extra?: ReactNode }) {
  const web = useWebUsage(2000)
  const alerts = webAlerts(web)
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
    ...(web.slowInputs.length
      ? [
          [
            `Over ${WEB_LIMITS.inputSlowMs} ms`,
            web.slowInputs.map((i) => `${inputText(i)}: ${i.ms} ms, ${ago(i.at, web.takenAt)}`).join(' · '),
          ] as [string, string],
        ]
      : []),
    [
      'Page elements',
      web.domNodes === null
        ? 'not counted yet'
        : `${web.domNodes}, ${web.domBounded ?? 0} of them terminal and conversation history (kept to a bound)` +
          (web.domSettled === null ? '' : `; the rest ${web.domSettled} once settled`) +
          times(web.domGrowth),
    ],
    ['Open for', age(web.ageMs)],
    [
      'Drawing with',
      web.renderer === null
        ? 'unknown here'
        : web.renderer.software
          ? `software (${web.renderer.name}): the browser lost GPU acceleration, restart it`
          : web.renderer.name,
    ],
  ]
  return (
    <section className="flex flex-col gap-2" aria-label="Diagnostics">
      <h2 className={ink.label}>Diagnostics</h2>
      {alerts.map((a) => (
        <p key={a.metric} className={ink.noteWarning}>
          {alertText(a)}
        </p>
      ))}
      <dl className={`${ink.body} grid grid-cols-[auto_1fr] gap-x-4 gap-y-1`}>
        {rows.map(([name, value]) => (
          <div key={name} className="contents">
            <dt className={ink.quiet}>{name}</dt>
            <dd className={ink.count}>{value}</dd>
          </div>
        ))}
      </dl>
      {extra}
    </section>
  )
}
