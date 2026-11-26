import { Clock, Monitor } from 'lucide-react'
import { Meter } from '@/components/ui/meter'
import { ink, look } from '@/components/ui/intents'
import type { PlanAccount, UsageWindow } from '@/lib/api/types'
import {
  accountName,
  clockAt,
  limitedUntil,
  machineNames,
  mainWindows,
  modelWindows,
  percentOf,
  percentText,
  planName,
  PROVIDER_NAME,
  resetsAt,
  shortKey,
  staleMinutes,
  timeLeft,
  windowTone,
  type Tone,
} from '../model/plan-usage'

export const toneInk: Record<Tone, string> = { normal: ink.strong, warning: ink.warning, danger: ink.danger }

/** One account: its provider and plan, its machines, then each window with its percent, a bar and its exact
 *  reset; the per-model limits after. `full` (Daemons › Plan usage) adds a short form of its key and lays the
 *  windows out in two columns from `sm`. */
export function AccountUsage({
  account,
  accounts,
  now,
  threshold,
  full = false,
}: {
  account: PlanAccount
  accounts: PlanAccount[]
  now: number
  threshold: number
  full?: boolean
}) {
  const grid = full ? 'grid gap-3 sm:grid-cols-2' : 'flex flex-col gap-2'
  const until = limitedUntil(account)
  const stale = staleMinutes(account, now)
  const models = modelWindows(account)
  const plan = planName(account)
  const machines = machineNames(account)
  return (
    <section className="flex flex-col gap-2" aria-label={accountName(account, accounts)}>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <h3 className={ink.strong}>{PROVIDER_NAME[account.provider]}</h3>
          {plan ? <span className={look.tag}>{plan}</span> : null}
          {full ? <span className={ink.codeMeta}>account {shortKey(account)}</span> : null}
        </div>
        {machines.length ? (
          <p className={`${ink.meta} flex items-center gap-1`}>
            <Monitor className="size-3 shrink-0" aria-hidden /> {machines.join(' · ')}
          </p>
        ) : null}
        {until !== null ? (
          <p className={ink.noteDanger}>
            Limited until {clockAt(until, now)} · {timeLeft(until, now, true)} left
          </p>
        ) : null}
        {stale !== null ? (
          <p className={`${ink.meta} flex items-center gap-1`}>
            <Clock className="size-3 shrink-0" aria-hidden /> As of {stale} min ago
          </p>
        ) : null}
      </div>
      <ul className={grid}>
        {mainWindows(account).map((w) => (
          <WindowRow key={w.id} account={account} w={w} now={now} threshold={threshold} />
        ))}
      </ul>
      {models.length ? (
        <>
          <h4 className={ink.eyebrow}>Per model</h4>
          <ul className={grid}>
            {models.map((w) => (
              <WindowRow key={w.id} account={account} w={w} now={now} threshold={threshold} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}

/** A window: its name and percent, a bar, when it resets; a figure the reply did not have reads "—". */
function WindowRow({ account, w, now, threshold }: { account: PlanAccount; w: UsageWindow; now: number; threshold: number }) {
  const tone = windowTone(account, w, threshold)
  const label = w.label
  const reset = resetsAt(w)
  return (
    <li className="grid grid-cols-[1fr_auto] items-baseline gap-x-2 gap-y-1">
      <span className={ink.body}>{label}</span>
      <span className={`${toneInk[tone]} ${ink.count}`}>{percentText(w)}</span>
      <Meter className="col-span-2" value={percentOf(w)} tone={tone} label={label} />
      {reset === null ? null : (
        <span className={`${ink.meta} col-span-2`}>
          Resets {clockAt(reset, now)} · in {timeLeft(reset, now, true)}
        </span>
      )}
    </li>
  )
}
