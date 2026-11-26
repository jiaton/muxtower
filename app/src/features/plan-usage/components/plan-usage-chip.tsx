import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Island } from '@/components/ui/island'
import { ink } from '@/components/ui/intents'
import { Popover } from '@/components/ui/popover'
import { useMediaQuery } from '@/lib/use-media-query'
import { usePlanUsage } from '../api/use-plan-usage'
import { useNow } from '../hooks/use-now'
import type { PlanAccount, UsageWindow } from '@/lib/api/types'
import {
  accountName,
  accountsOf,
  accountTone,
  chipWindows,
  limitedUntil,
  nearestAccount,
  percentText,
  resetsAt,
  staleMinutes,
  timeLeft,
  windowShort,
  windowTone,
  worst,
} from '../model/plan-usage'
import { useIsland, usePlanUsagePrefs } from '../store'
import { AccountUsage, toneInk } from './account-usage'
import { ISLAND } from './plan-usage-island'

/** From Tailwind `xl` the docked sidebar is 16rem: room for both windows on an account's line. */
const ROOMY_QUERY = '(min-width: 80rem)'

/**
 * The header chip: each account's 5-hour and weekly use and how long until each resets, live. Just numbers:
 * the warning tone only from the threshold up, danger while limited. `full` (the docked sidebar): a line per
 * account, figures aligned; below `xl`, or when a provider comes twice (longer names), each account's
 * fullest window only. `compact` (a pane's header): the account nearest a limit, its fullest window. A tap
 * opens every window with its exact reset (a sheet on a phone). While the island is out, the chip gives it
 * its name, so the island grows out of it and settles back into it.
 */
export function PlanUsageChip({ density }: { density: 'full' | 'compact' }) {
  const usage = usePlanUsage().data
  const threshold = usePlanUsagePrefs((s) => s.threshold)
  const out = useIsland((s) => s.shown !== null)
  const roomy = useMediaQuery(ROOMY_QUERY)
  const now = useNow()
  const accounts = accountsOf(usage)
  if (!accounts.length) return null
  const repeated = new Set(accounts.map((a) => a.provider)).size < accounts.length
  const only = density === 'compact' || !roomy || repeated
  const shown = density === 'full' ? accounts : [nearestAccount(accounts, threshold)]
  return (
    <Popover
      title="Plan usage"
      trigger={
        <Button variant="plain" className={density === 'full' ? 'w-full min-w-0' : 'hidden min-w-0 @min-[3rem]:flex'} aria-label="Plan usage">
          <Island
            shape="chip"
            tone={worst(accounts.map((a) => accountTone(a, threshold)))}
            name={out ? undefined : ISLAND}
            className={density === 'full' ? 'w-full' : undefined}
            title={
              density === 'compact' ? (
                <CompactLine account={shown[0]!} accounts={accounts} now={now} threshold={threshold} />
              ) : (
                <span className={`grid ${only ? 'grid-cols-[auto_auto]' : 'grid-cols-[auto_auto_auto]'} items-baseline justify-start gap-x-1 gap-y-0.5`}>
                  {shown.map((a) => (
                    <ChipLine key={`${a.provider}:${a.account}`} account={a} accounts={accounts} now={now} threshold={threshold} only={only} />
                  ))}
                </span>
              )
            }
          />
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {accounts.map((a) => (
          <AccountUsage key={`${a.provider}:${a.account}`} account={a} accounts={accounts} now={now} threshold={threshold} />
        ))}
        <Link to="/daemons" hash="plan-usage" className={ink.link}>
          Plan usage settings
        </Link>
      </div>
    </Popover>
  )
}

/** An account's cells in the chip's columns: "Claude · 5h 44% · 2h10m · wk 68% · 2d"; `only`, its fullest
 *  window alone. Limited, it says so and for how long. A reading that is old is quieter. */
function ChipLine({ account, accounts, now, threshold, only }: { account: PlanAccount; accounts: PlanAccount[]; now: number; threshold: number; only: boolean }) {
  const name = <span className={ink.strong}>{accountName(account, accounts)}</span>
  const until = limitedUntil(account)
  if (until !== null)
    return (
      <span className="contents">
        {name}
        <span className={`${ink.danger} col-span-2`}>limited · {timeLeft(until, now)}</span>
      </span>
    )
  const windows = chipWindows(account, only)
  return (
    <span className={`${staleMinutes(account, now) !== null ? ink.quiet : ''} contents`}>
      {name}
      {windows.map((w) => (
        <ChipFigure key={w.id} account={account} w={w} now={now} threshold={threshold} />
      ))}
    </span>
  )
}

/** The compact chip's line, saying less as the room its header leaves it narrows (the header's `reading` is
 *  an `@container`): the time to reset goes first, then the account's name, then the window's; the percent,
 *  in its tone, stays. Narrower still, the chip goes (`PlanUsageChip`): the header's controls never move.
 *  Each part comes at the width it needs, the chip's padding and border included: the percent 46 px; with the
 *  window's name 66; with the account's 110; with the time to reset 132 to 154 ("2d" to "2h10m": from 152 a
 *  long one may truncate inside the chip). Limited: "limited · 1h12m" 103, with the name 147. */
function CompactLine({ account, accounts, now, threshold }: { account: PlanAccount; accounts: PlanAccount[]; now: number; threshold: number }) {
  const until = limitedUntil(account)
  const name = (
    <span className={`${ink.strong} hidden ${until === null ? '@min-[7rem]:inline' : '@min-[9.5rem]:inline'}`}>{accountName(account, accounts)}</span>
  )
  if (until !== null)
    return (
      <span className="flex items-baseline gap-1">
        {name}
        <span className={ink.danger}>
          limited<span className="hidden @min-[6.5rem]:inline">{` · ${timeLeft(until, now)}`}</span>
        </span>
      </span>
    )
  const w = chipWindows(account, true)[0]
  const reset = w ? resetsAt(w) : null
  return (
    <span className={`${staleMinutes(account, now) !== null ? ink.quiet : ''} flex items-baseline gap-1`}>
      {name}
      {w ? (
        <span>
          <span className="hidden @min-[4.25rem]:inline">{windowShort(w)} </span>
          <span className={toneInk[windowTone(account, w, threshold)]}>{percentText(w)}</span>
          {reset === null ? null : <span className="hidden @min-[9.5rem]:inline">{`\u2009·\u2009${timeLeft(reset, now)}`}</span>}
        </span>
      ) : null}
    </span>
  )
}

function ChipFigure({ account, w, now, threshold }: { account: PlanAccount; w: UsageWindow; now: number; threshold: number }) {
  const reset = resetsAt(w)
  return (
    <span>
      {windowShort(w)} <span className={toneInk[windowTone(account, w, threshold)]}>{percentText(w)}</span>
      {reset === null ? null : ` · ${timeLeft(reset, now)}`}
    </span>
  )
}
