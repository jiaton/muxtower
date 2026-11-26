import { describe, expect, it } from 'vitest'
import { claude, codex, minutes, win } from '../test/hub'
import {
  accountName,
  accountsOf,
  accountTone,
  chipWindows,
  clockAt,
  islandSubjects,
  mainWindows,
  modelWindows,
  nearestAccount,
  percentText,
  planName,
  staleMinutes,
  subjectKey,
  timeLeft,
  windowTone,
} from './plan-usage'

const NOW = new Date(2026, 10, 26, 12, 0).getTime() // a Thursday, noon, this device's zone

describe('time left and exact times', () => {
  it('says time left short for the chip and long for the details', () => {
    expect(timeLeft(NOW + 130 * 60_000, NOW)).toBe('2h10m')
    expect(timeLeft(NOW + 130 * 60_000, NOW, true)).toBe('2h 10m')
    expect(timeLeft(NOW + 42 * 60_000, NOW)).toBe('42m')
    expect(timeLeft(NOW + 3120 * 60_000, NOW)).toBe('2d')
    expect(timeLeft(NOW + 3120 * 60_000, NOW, true)).toBe('2d 4h')
    expect(timeLeft(NOW - 60_000, NOW)).toBe('0m')
  })

  it('names a reset by the clock today, tomorrow, by weekday within the week, by date after', () => {
    const at = (d: number, h: number, m = 0) => new Date(2026, 10, 26 + d, h, m).getTime()
    expect(clockAt(at(0, 14, 10), NOW)).toBe('14:10')
    expect(clockAt(at(1, 9), NOW)).toBe('tomorrow 09:00')
    expect(clockAt(at(2, 16, 17), NOW)).toBe('Sat 16:17')
    expect(clockAt(at(8, 9), NOW)).toBe('Dec 4, 09:00')
  })
})

describe('windows and accounts', () => {
  it('shows nothing while off', () => {
    expect(accountsOf({ enabled: false, accounts: [claude()] })).toEqual([])
    expect(accountsOf({ enabled: true })).toEqual([])
    expect(accountsOf(undefined)).toEqual([])
  })

  it('orders the 5 hours, the week, any other length; the per-model ones apart', () => {
    const a = claude({ windows: [win('weekly_scoped', 61, 10, { model: 'Opus' }), win('other', 5, 10), win('weekly', 68, 10), win('session', 44, 10)] })
    expect(mainWindows(a).map((w) => w.kind)).toEqual(['session', 'weekly', 'other'])
    expect(modelWindows(a).map((w) => w.label)).toEqual(['Week, Opus'])
    expect(chipWindows(a).map((w) => w.kind)).toEqual(['session', 'weekly'])
    expect(chipWindows(a, true).map((w) => w.kind)).toEqual(['weekly'])
    expect(chipWindows(claude({ windows: [] }), true)).toEqual([])
  })

  it('rounds a percent, and a missing one is "—"', () => {
    expect(percentText(win('session', 81.6, 10))).toBe('82%')
    expect(percentText(win('session', null, null))).toBe('—')
    expect(percentText({ id: 'x', kind: 'other', label: 'X' })).toBe('—')
  })

  it('tones a window from the threshold, and a limited account as danger', () => {
    const a = claude({ windows: [win('session', 82, 60), win('weekly', null, null)] })
    expect(windowTone(a, a.windows![0]!, 80)).toBe('warning')
    expect(windowTone(a, a.windows![0]!, 90)).toBe('normal')
    expect(windowTone(a, a.windows![1]!, 80)).toBe('normal')
    expect(accountTone(a, 80)).toBe('warning')
    const limited = claude({ limited_until: minutes(70), windows: [win('session', 100, 70)] })
    expect(accountTone(limited, 80)).toBe('danger')
    expect(windowTone(limited, limited.windows![0]!, 80)).toBe('danger')
  })

  it('names a plan as said, and adds it (or the short key) only when the provider comes twice', () => {
    const max = claude()
    const pro = claude({ account: 'b9041d77ee', plan: 'pro' })
    expect(planName(max)).toBe('Max')
    expect(planName(claude({ plan: null }))).toBeNull()
    expect(accountName(max, [max, codex()])).toBe('Claude')
    expect([accountName(max, [max, pro]), accountName(pro, [max, pro])]).toEqual(['Claude Max', 'Claude Pro'])
    const other = claude({ account: 'e55d01aa' })
    expect([accountName(max, [max, other]), accountName(other, [max, other])]).toEqual(['Claude a7f3', 'Claude e55d'])
  })

  it('finds the account nearest a limit', () => {
    const c = codex({ windows: [win('session', 90, 30), win('weekly', 40, 600)] })
    expect(nearestAccount([claude(), c], 80)).toBe(c)
    const limited = claude({ limited_until: minutes(60) })
    expect(nearestAccount([c, limited], 80)).toBe(limited)
  })

  it('says a reading older than two polls with its age', () => {
    const now = Date.now()
    expect(staleMinutes(claude(), now)).toBeNull()
    expect(staleMinutes(codex({ observed_at: minutes(-12) }), now)).toBe(12)
  })
})

describe('island subjects', () => {
  it('puts a limited account first, then windows over the threshold, fullest first, the limited one only once', () => {
    const a = claude({ windows: [win('session', 82, 60), win('weekly', 91, 3000)] })
    const limited = codex({ limited_until: minutes(30), windows: [win('session', 100, 30)] })
    const subjects = islandSubjects([a, limited], 80)
    expect(subjects.map((s) => (s.kind === 'limited' ? 'limited' : `${s.window.kind} ${s.window.percent}`))).toEqual(['limited', 'weekly 91', 'session 82'])
    expect(islandSubjects([claude()], 80)).toEqual([])
  })

  it('keys a window by account and window id, not by its reset (which may move between readings)', () => {
    const before = claude({ windows: [win('session', 82, 60)] })
    const later = claude({ windows: [win('session', 84, 61)] })
    expect(subjectKey(islandSubjects([before], 80)[0]!)).toBe(subjectKey(islandSubjects([later], 80)[0]!))
    expect(subjectKey(islandSubjects([claude({ limited_until: minutes(30) })], 80)[0]!)).toMatch(/^limited:claude:a7f3c09e5d21:/)
  })
})
