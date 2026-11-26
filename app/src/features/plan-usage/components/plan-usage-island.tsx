import { OctagonPause } from 'lucide-react'
import { useEffect } from 'react'
import { Island, morph, prefersStill } from '@/components/ui/island'
import { Ring } from '@/components/ui/meter'
import { usePlanUsage } from '../api/use-plan-usage'
import { useNow } from '../hooks/use-now'
import type { PlanAccount } from '@/lib/api/types'
import { accountName, accountsOf, clockAt, islandSubjects, percentOf, resetsAt, subjectKey, timeLeft, type IslandSubject } from '../model/plan-usage'
import { useIsland, usePlanUsagePrefs } from '../store'

/** The view-transition name the chip and the island share (one of them on the page at a time). */
export const ISLAND = 'plan-usage-island'

export const GROW_AFTER_MS = 900
export const HOLD_MS = 6000

/**
 * The island: when a window passes the threshold, or an account is limited, the chip grows into a dark pill
 * below the header, over the page (nothing moves under it), says what and until when, holds six seconds and
 * settles back; a tap settles it at once. Each subject grows once while it lasts (`subjectKey`); several,
 * one after another, most pressing first. Under reduced motion it never grows: the chip's tone is the
 * highlight. Without View Transitions it appears and goes at once, on the same rules.
 */
export function PlanUsageIsland() {
  const usage = usePlanUsage().data
  const accounts = accountsOf(usage)
  const loaded = usage !== undefined
  const threshold = usePlanUsagePrefs((s) => s.threshold)
  const seen = usePlanUsagePrefs((s) => s.seen)
  const shown = useIsland((s) => s.shown)
  const now = useNow()
  const subjects = islandSubjects(accounts, threshold)
  const keys = subjects.map(subjectKey)
  const next = keys.find((k) => !seen.includes(k)) ?? null
  const live = keys.join('\n')

  // What is no longer a subject is forgotten, so its next crossing grows again; only from a reading.
  useEffect(() => {
    if (loaded) usePlanUsagePrefs.getState().forget(live ? live.split('\n') : [])
  }, [loaded, live])

  // The next subject not yet shown grows, a moment after it appears (or after the one before settled).
  useEffect(() => {
    if (next === null || shown !== null || prefersStill()) return
    const grow = setTimeout(() => {
      usePlanUsagePrefs.getState().markSeen(next)
      morph(() => useIsland.getState().show(next))
    }, GROW_AFTER_MS)
    return () => clearTimeout(grow)
  }, [next, shown])

  // Out, it holds, then settles; and at once if its subject is gone (the limit lifted, turned off).
  const subject = shown === null ? undefined : subjects[keys.indexOf(shown)]
  const present = subject !== undefined
  useEffect(() => {
    if (shown === null) return
    const settle = setTimeout(() => morph(() => useIsland.getState().settle()), present ? HOLD_MS : 0)
    return () => clearTimeout(settle)
  }, [shown, present])

  if (!subject) return null
  return <SubjectIsland subject={subject} accounts={accounts} now={now} onPress={() => morph(() => useIsland.getState().settle())} />
}

/** The island grown: the window as a ring with its percent, what it is and when it resets; or that an account
 *  is limited, until when. */
function SubjectIsland({ subject, accounts, now, onPress }: { subject: IslandSubject; accounts: PlanAccount[]; now: number; onPress: () => void }) {
  const name = accountName(subject.account, accounts)
  if (subject.kind === 'limited') {
    const full = (subject.account.windows ?? []).find((w) => (percentOf(w) ?? 0) >= 100)
    const title = `${name} limited until ${clockAt(subject.until, now)}`
    return (
      <Island
        shape="float"
        name={ISLAND}
        onPress={onPress}
        label={`${title}. Dismiss`}
        lead={
          <Ring value={100} tone="danger" label="Limited">
            <OctagonPause aria-hidden />
          </Ring>
        }
        title={title}
        detail={`${timeLeft(subject.until, now, true)} left${full ? ` · ${full.label}` : ''}`}
      />
    )
  }
  const w = subject.window
  const label = w.label
  const percent = percentOf(w)
  const reset = resetsAt(w)
  return (
    <Island
      shape="float"
      name={ISLAND}
      onPress={onPress}
      label={`${name} ${label} at ${percent}%. Dismiss`}
      lead={
        <Ring value={percent} tone="warning" label={label}>
          {percent}%
        </Ring>
      }
      title={`${name} · ${label}`}
      detail={reset === null ? undefined : `Resets ${clockAt(reset, now)} · in ${timeLeft(reset, now, true)}`}
    />
  )
}
