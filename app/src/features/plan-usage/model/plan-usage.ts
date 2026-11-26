import type { PlanAccount, PlanProvider, PlanUsage, UsageWindow } from '@/lib/api/types'

export const PROVIDER_NAME: Record<PlanProvider, string> = { claude: 'Claude', codex: 'Codex' }

/** How often the machines read their plans; a reading older than two of these is said with its age. */
export const POLL_MS = 5 * 60_000

export type Tone = 'normal' | 'warning' | 'danger'

const at = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null)

/** What the app shows: the accounts while it is on, none while off. */
export const accountsOf = (usage: PlanUsage | undefined) => (usage?.enabled ? (usage.accounts ?? []) : [])

export const windowsOf = (account: PlanAccount) => account.windows ?? []

/** Its percent as a whole figure, or null when the reply had none ("—"). */
export const percentOf = (w: UsageWindow) => (w.percent === null || w.percent === undefined ? null : Math.round(w.percent))
export const percentText = (w: UsageWindow) => {
  const p = percentOf(w)
  return p === null ? '—' : `${p}%`
}

/** Its short name in the chip; only the 5-hour and the week's windows have one (the chip shows only them). */
export const windowShort = (w: UsageWindow) => (w.kind === 'session' ? '5h' : w.kind === 'weekly' ? 'wk' : null)

export const resetsAt = (w: UsageWindow) => at(w.resets_at)
export const limitedUntil = (a: PlanAccount) => at(a.limited_until)
const isLimited = (a: PlanAccount) => limitedUntil(a) !== null

const ORDER: Record<UsageWindow['kind'], number> = { session: 0, weekly: 1, other: 2, weekly_scoped: 3 }

/** The account-wide windows (the 5 hours, the week, then any other length); the per-model ones apart. */
export const mainWindows = (account: PlanAccount) =>
  windowsOf(account)
    .filter((w) => w.kind !== 'weekly_scoped')
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
export const modelWindows = (account: PlanAccount) => windowsOf(account).filter((w) => w.kind === 'weekly_scoped')

/** A plan as named ("max" → "Max"); null when not said. */
export const planName = (account: PlanAccount) => (account.plan ? account.plan.charAt(0).toUpperCase() + account.plan.slice(1) : null)

/** The account's key in short (a hash: its first characters tell accounts apart). */
export const shortKey = (account: PlanAccount) => account.account.slice(0, 4)

export const machineNames = (account: PlanAccount) => (account.machines ?? []).map((m) => m.machine)

export function windowTone(account: PlanAccount, w: UsageWindow, threshold: number): Tone {
  const p = percentOf(w)
  if (isLimited(account) && (p ?? 0) >= 100) return 'danger'
  if (p !== null && p >= threshold) return 'warning'
  return 'normal'
}

export function accountTone(account: PlanAccount, threshold: number): Tone {
  if (isLimited(account)) return 'danger'
  return windowsOf(account).some((w) => windowTone(account, w, threshold) === 'warning') ? 'warning' : 'normal'
}

export const worst = (tones: Tone[]): Tone => (tones.includes('danger') ? 'danger' : tones.includes('warning') ? 'warning' : 'normal')

/** Minutes since it was read, when that is longer than two polls (its machines are away); else null. */
export function staleMinutes(account: PlanAccount, now: number) {
  const age = now - Date.parse(account.observed_at)
  return age > 2 * POLL_MS ? Math.round(age / 60_000) : null
}

/** How an account is named where several are listed: its provider; with its plan too when the provider comes
 *  twice ("Claude Max", "Claude Pro"); with its short key when even the plan is the same. */
export function accountName(account: PlanAccount, all: PlanAccount[]) {
  const name = PROVIDER_NAME[account.provider]
  const same = all.filter((a) => a.provider === account.provider)
  if (same.length < 2) return name
  const plan = planName(account)
  return plan && same.filter((a) => a.plan === account.plan).length < 2 ? `${name} ${plan}` : `${name} ${shortKey(account)}`
}

/** Time left, short for the chip ("2h10m", "42m", "2d") or long ("2h 10m", "2d 4h"). */
export function timeLeft(until: number, now: number, long = false) {
  const minutes = Math.max(0, Math.round((until - now) / 60_000))
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  if (d) return long && h ? `${d}d ${h}h` : `${d}d`
  if (h) return long ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h${String(m).padStart(2, '0')}m`
  return `${m}m`
}

/** A reset's exact time, in this device's zone: "14:10" today, "tomorrow 09:00", "Fri 09:00" within the
 *  week, else "Dec 3, 09:00". */
export function clockAt(when: number, now: number) {
  const time = new Date(when).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const days = Math.round((new Date(when).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days <= 0) return time
  if (days === 1) return `tomorrow ${time}`
  if (days < 7) return `${new Date(when).toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`
  return `${new Date(when).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

/** The chip's windows of an account (the 5 hours, the week), or (`only`) the fuller of them. */
export function chipWindows(account: PlanAccount, only = false) {
  const all = mainWindows(account).filter((w) => windowShort(w) !== null)
  if (!only || all.length < 2) return all
  return [all.reduce((a, b) => ((percentOf(b) ?? -1) > (percentOf(a) ?? -1) ? b : a))]
}

/** The account nearest a limit: a limited one, else the one with the fullest 5-hour or weekly window. */
export function nearestAccount(accounts: PlanAccount[], threshold: number) {
  const rank = (a: PlanAccount) => (accountTone(a, threshold) === 'danger' ? 1000 : 0) + Math.max(-1, ...chipWindows(a).map((w) => percentOf(w) ?? -1))
  return accounts.reduce((a, b) => (rank(b) > rank(a) ? b : a))
}

/** What the island speaks of: an account that is limited, or a window at or over the threshold. */
export type IslandSubject = { kind: 'limited'; account: PlanAccount; until: number } | { kind: 'high'; account: PlanAccount; window: UsageWindow }

/** Every subject there is now, most pressing first: limited accounts, then windows by how full. A limited
 *  account is said once, as limited, not again for its full window. */
export function islandSubjects(accounts: PlanAccount[], threshold: number): IslandSubject[] {
  const limited: IslandSubject[] = accounts.filter(isLimited).map((account) => ({ kind: 'limited', account, until: limitedUntil(account)! }))
  const high = accounts
    .filter((a) => !isLimited(a))
    .flatMap((account) => windowsOf(account).filter((w) => (percentOf(w) ?? -1) >= threshold).map((window) => ({ kind: 'high' as const, account, window })))
    .sort((a, b) => (percentOf(b.window) ?? 0) - (percentOf(a.window) ?? 0))
  return [...limited, ...high]
}

/** Its key. The island grows once for each, then not again while it lasts: a window stays over the
 *  threshold, an account stays limited; once it is no longer a subject (the window reset, the limit
 *  lifted), its key is forgotten and the next crossing grows again. Not by a reset time, which may move
 *  between readings. */
export const subjectKey = (s: IslandSubject) =>
  s.kind === 'limited' ? `limited:${s.account.provider}:${s.account.account}:${s.until}` : `high:${s.account.provider}:${s.account.account}:${s.window.id}`
