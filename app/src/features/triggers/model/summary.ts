import type { FiringOutcome, Trigger, TriggerAction } from '@/lib/api/types'
import { ago } from '@/lib/time'

/** A folder as a person writes it: the home folder as `~`. */
export function shortFolder(cwd: string | null | undefined, home?: string | null): string {
  if (!cwd) return '~'
  if (home && (cwd === home || cwd.startsWith(`${home}/`))) return `~${cwd.slice(home.length)}`
  return cwd.replace(/^\/(home|Users)\/[^/]+(?=\/|$)/, '~')
}

/** What a trigger does, in a few words: "→ buyer@deals", "start in ~/code", "notify". */
export function actionSummary(action: TriggerAction, home?: string | null): string {
  switch (action.kind) {
    case 'deliver':
      return `→ ${action.to}`
    case 'start':
      return `start in ${shortFolder(action.cwd, home)}${action.machine ? ` on ${action.machine}` : ''}`
    case 'notify':
      return 'notify'
  }
}

/** Its limits, short: "3/h · dedupe 7d"; empty when it has none. */
export function limitsSummary(trigger: Pick<Trigger, 'rate_per_hour' | 'dedupe'>): string {
  const parts: string[] = []
  if (trigger.rate_per_hour) parts.push(`${trigger.rate_per_hour}/h`)
  if (trigger.dedupe) parts.push(`dedupe ${trigger.dedupe.days}d`)
  return parts.join(' · ')
}

export type OutcomeTone = 'success' | 'neutral' | 'idle' | 'permission' | 'error'

/** How each outcome is said and marked: what happened, by tone and by word (never by colour alone). */
export const OUTCOMES: Record<FiringOutcome, { label: string; tone: OutcomeTone; hint: string }> = {
  delivered: { label: 'Delivered', tone: 'success', hint: 'sent to the session' },
  started: { label: 'Started', tone: 'success', hint: 'a new session was started' },
  notified: { label: 'Notified', tone: 'success', hint: 'a notification went out' },
  filtered: { label: 'Filtered', tone: 'neutral', hint: 'a filter did not hold' },
  deduped: { label: 'Duplicate', tone: 'neutral', hint: 'its key was seen before' },
  paused: { label: 'Paused', tone: 'idle', hint: 'the trigger was paused' },
  rate_limited: { label: 'Rate limited', tone: 'permission', hint: 'over its rate per hour' },
  failed: { label: 'Failed', tone: 'error', hint: 'its action did not go through' },
}

/** Lowercase letters, digits, - and _: what `muxtower trigger <name>` takes. */
export const NAME_PATTERN = /^[a-z0-9_-]+$/

/** "12m ago", or "just now". */
export function agoText(iso: string, now = Date.now()): string {
  const short = ago(iso, now)
  return short === 'now' ? 'just now' : `${short} ago`
}
