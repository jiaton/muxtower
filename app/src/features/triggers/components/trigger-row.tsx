import { Button } from '@/components/ui/button'
import { ink } from '@/components/ui/intents'
import { StatusDot } from '@/components/ui/status-dot'
import type { Trigger } from '@/lib/api/types'
import { actionSummary, agoText, limitsSummary } from '../model/summary'
import { OutcomeBadge } from './outcome-badge'

/** One trigger in the list: on or paused, what it does, its limits, how it last went; a tap opens it. */
export function TriggerRow({
  trigger,
  onOpen,
  onToggle,
  toggling,
}: {
  trigger: Trigger
  onOpen: () => void
  onToggle: () => void
  toggling: boolean
}) {
  const limits = limitsSummary(trigger)
  return (
    <li className="flex items-center gap-2 py-2 pr-2 sm:pr-3">
      <Button variant="plain" className="flex min-w-0 flex-1 items-start gap-2 py-0.5 pl-2 text-left sm:pl-3" onClick={onOpen}>
        <span className="flex h-5 items-center">
          <StatusDot tone={trigger.enabled ? 'ok' : 'idle'} label={trigger.enabled ? 'On' : 'Paused'} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`${ink.strong} truncate`}>{trigger.name}</span>
          <span className={`${ink.meta} truncate`}>{actionSummary(trigger.action)}</span>
          <span className={`${ink.meta} flex flex-wrap items-center gap-x-1.5 gap-y-0.5`}>
            {trigger.last_fired_at && trigger.last_outcome ? (
              <>
                <OutcomeBadge outcome={trigger.last_outcome} />
                <span className={ink.count}>{agoText(trigger.last_fired_at)}</span>
              </>
            ) : (
              <span>Never fired</span>
            )}
            {limits ? <span>· {limits}</span> : null}
          </span>
        </span>
      </Button>
      <Button variant="outline" size="sm" disabled={toggling} onClick={onToggle} aria-label={`${trigger.enabled ? 'Pause' : 'Resume'} ${trigger.name}`}>
        {trigger.enabled ? 'Pause' : 'Resume'}
      </Button>
    </li>
  )
}
