import { FlaskConical, Terminal, Webhook, type LucideIcon } from 'lucide-react'
import { Banner } from '@/components/ui/banner'
import { ink, look } from '@/components/ui/intents'
import { Loading } from '@/components/ui/skeleton'
import type { Firing } from '@/lib/api/types'
import { LOG_SIZE, useFirings } from '../api/use-triggers'
import { agoText } from '../model/summary'
import { OutcomeBadge } from './outcome-badge'

const VIA: Record<Firing['via'], { label: string; icon: LucideIcon }> = {
  webhook: { label: 'webhook', icon: Webhook },
  cli: { label: 'command line', icon: Terminal },
  test: { label: 'test', icon: FlaskConical },
}

/** One firing: when, how it came, what became of it, where it went, and why. */
export function FiringLine({ firing }: { firing: Firing }) {
  const via = VIA[firing.via]
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <OutcomeBadge outcome={firing.outcome} />
        <span className={`${ink.meta} flex items-center gap-1`}>
          <via.icon aria-hidden className="size-3.5" />
          {via.label}
        </span>
        <time className={`${ink.meta} ${ink.count} ml-auto`} dateTime={firing.at} title={new Date(firing.at).toLocaleString()}>
          {agoText(firing.at)}
        </time>
      </div>
      {firing.target ? <span className={`${ink.codeSmall} truncate`}>→ {firing.target}</span> : null}
      {firing.detail ? <span className={`${firing.outcome === 'failed' ? ink.noteDanger : ink.meta} break-words`}>{firing.detail}</span> : null}
    </li>
  )
}

/** Its last firings, newest first, whatever became of each. */
export function FiringLog({ daemonId, triggerId }: { daemonId: string; triggerId: string }) {
  const firings = useFirings(daemonId, triggerId)
  if (firings.error) return <Banner tone="error">{firings.error.message}</Banner>
  if (!firings.data) return <Loading label="Loading its log…" />
  if (!firings.data.length) return <p className={`${ink.hint} py-2`}>Nothing yet. Fire a test, or send it an event.</p>
  return (
    <div className="flex flex-col gap-1">
      <p className={ink.meta}>The last {LOG_SIZE} firings at most, newest first.</p>
      <ul className={`${look.rows} flex flex-col`} aria-label="Firings">
        {firings.data.map((f) => (
          <FiringLine key={f.id} firing={f} />
        ))}
      </ul>
    </div>
  )
}
