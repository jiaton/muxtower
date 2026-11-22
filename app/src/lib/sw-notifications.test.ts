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
    expect((await closeSessions(r.registration, 'd1', ['a'])).closed).toEqual(['d1:a'])
    expect(r.closed).toEqual(['d1:a'])
  })
  it('a clearing push leaves one on screen: if closing would leave none, it closes none', async () => {
    const r = registration(sessionTag('d1', 'a'), sessionTag('d1', 'b'))
    expect(await closeSessions(r.registration, 'd1', ['a', 'b'], true)).toMatchObject({ closed: [], held: ['d1:a', 'd1:b'] })
    expect(r.closed).toEqual([])
    expect(await closeSessions(r.registration, 'd1', ['a'], true)).toMatchObject({ closed: ['d1:a'], held: [] })
    expect(r.closed).toEqual(['d1:a'])
    expect(await closeSessions(r.registration, 'd1', ['b'], true)).toMatchObject({ closed: [], held: ['d1:b'] }) // the last one stays
  })
  it('says what it was asked, what was there and when it came, by tag only', async () => {
    const shown: ShownNotification[] = [
      { tag: 'd1:a', timestamp: 5, data: { at: 7 }, close: () => undefined },
      { tag: 'd1:b', timestamp: 9, close: () => undefined },
    ]
    const outcome = await closeSessions({ getNotifications: async () => shown }, 'd1', ['a', 'gone'])
    expect(outcome).toEqual({
      asked: ['d1:a', 'd1:gone'],
      present: [
        { tag: 'd1:a', at: 7 },
        { tag: 'd1:b', at: 9 },
      ],
      closed: ['d1:a'],
      held: [],
    })
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
