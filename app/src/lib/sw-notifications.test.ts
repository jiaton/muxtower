import { describe, expect, it } from 'vitest'
import { alertsAgain, closeSessions, pushTag, sessionTag, type ShownNotification } from './sw-notifications'

function registration(...tags: string[]) {
  const closed: string[] = []
  const shown: ShownNotification[] = tags.map((tag) => ({ tag, close: () => closed.push(tag) }))
  return { closed, registration: { getNotifications: async () => shown.filter((n) => !closed.includes(n.tag)) } }
}

describe('closeSessions', () => {
  it("closes these sessions' notifications of that daemon only", async () => {
    const r = registration(sessionTag('d1', 'a'), sessionTag('d1', 'b'), sessionTag('d2', 'a'))
    expect(await closeSessions(r.registration, 'd1', ['a'])).toBe(1)
    expect(r.closed).toEqual(['d1:a'])
  })
  it('a clearing push leaves one on screen: if closing would leave none, it closes none', async () => {
    const r = registration(sessionTag('d1', 'a'), sessionTag('d1', 'b'))
    expect(await closeSessions(r.registration, 'd1', ['a', 'b'], true)).toBe(0)
    expect(r.closed).toEqual([])
    expect(await closeSessions(r.registration, 'd1', ['a'], true)).toBe(1)
    expect(r.closed).toEqual(['d1:a'])
    expect(await closeSessions(r.registration, 'd1', ['b'], true)).toBe(0) // the last one stays
  })
})

it('a replacement alerts again only when the owner is needed', () => {
  expect(alertsAgain('attention')).toBe(true)
  expect(alertsAgain('done')).toBe(false)
})

it("a trigger's push replaces its own last one, apart from other triggers and from sessions", () => {
  const deal = pushTag('d1', { kind: 'trigger', trigger: 'deal-watch' })
  expect(deal).toBe(pushTag('d1', { kind: 'trigger', trigger: 'deal-watch' }))
  expect(deal).not.toBe(pushTag('d1', { kind: 'trigger', trigger: 'build-alerts' }))
  expect(pushTag('d1', { session_id: 's1', kind: 'done' })).toBe(sessionTag('d1', 's1'))
  expect(pushTag('d1', { kind: 'recovery' })).toBe(sessionTag('d1', 'recovery'))
  expect(alertsAgain('trigger')).toBe(true)
})
