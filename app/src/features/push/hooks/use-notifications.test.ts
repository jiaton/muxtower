import type { Session } from '@/lib/api/types'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCloseSettledNotifications, useNotificationClicks, settledIn } from './use-notifications'

const push = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ history: { push } }) }))
const posted = vi.hoisted(() => [] as { records: unknown[]; url?: string }[])
const kept = vi.hoisted(() => ({ records: [] as unknown[] }))
vi.mock('../api/report-clicks', async (actual) => ({
  ...(await actual<typeof import('../api/report-clicks')>()),
  postClicks: async (records: unknown[], url?: string) => void posted.push({ records, url }),
}))
vi.mock('@/lib/push-click-store', () => ({ takePushClicks: async () => kept.records.splice(0) }))

/** This browser as one that can push, its service workers showing `shown`. */
function browser(shown: { tag: string; at: number; close: () => void }[]) {
  const container = new EventTarget() as ServiceWorkerContainer
  const registration = { getNotifications: async () => shown.map((n) => ({ ...n, data: { at: n.at } })) }
  container.getRegistrations = async () => [registration as unknown as ServiceWorkerRegistration]
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', class {})
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true })
  return container
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('useNotificationClicks', () => {
  const navigate = (data: unknown, port?: { postMessage: (m: unknown) => void }) => {
    const e = new MessageEvent('message', { data })
    Object.defineProperty(e, 'ports', { value: port ? [port] : [] })
    return e
  }

  it('goes where a notification tapped while the app is open points, and says so on its port', () => {
    const container = browser([])
    container.startMessages = vi.fn()
    renderHook(() => useNotificationClicks())
    expect(container.startMessages).toHaveBeenCalled() // the queue is not left shut until the page has loaded
    const port = { postMessage: vi.fn() }
    container.dispatchEvent(navigate({ type: 'navigate', url: '/d/nas/s/s2' }, port))
    container.dispatchEvent(navigate({ type: 'other' }))
    expect(push.mock.calls).toEqual([['/d/nas/s/s2']])
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'navigated' })
    expect(push.mock.invocationCallOrder[0]).toBeLessThan(port.postMessage.mock.invocationCallOrder[0]!)
  })

  it("posts the worker's record with its own part, and the records kept from earlier clicks", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    posted.length = 0
    kept.records.push({ id: 'old', stage: 'sw' })
    const container = browser([])
    renderHook(() => useNotificationClicks())
    await vi.waitFor(() => expect(posted).toEqual([{ records: [{ id: 'old', stage: 'sw' }], url: undefined }])) // at start
    const at = new Date(Date.now() - 120).toISOString()
    const click = { id: 'c1', at, stage: 'sw', base: '/', target: '/d/:daemon/s/:session', windows: [], others: [], chosen: 0, message: 'sent', ack: null, ackMs: null, focus: null, fallback: 'none', ms: 3 }
    container.dispatchEvent(navigate({ type: 'navigate', url: '/d/nas/s/s2', click }, { postMessage: () => {} }))
    expect(posted[1]).toEqual({
      records: [{ ...click, stage: 'app', app: { ms: 120, from: '/' } }],
      url: '/d/nas/s/s2',
    })
    kept.records.push({ id: 'c1', stage: 'sw', ack: true })
    await vi.advanceTimersByTimeAsync(3000) // the worker's whole record, by then kept
    expect(posted[2]?.records).toEqual([{ id: 'c1', stage: 'sw', ack: true }])
    vi.useRealTimers()
  })
})

describe('useCloseSettledNotifications', () => {
  it('closes the notifications of settled sessions, by news newer than them', async () => {
    const closed: string[] = []
    const note = (tag: string, at: number) => ({ tag, at, close: () => closed.push(tag) })
    browser([note('nas:read', 100), note('nas:waiting', 100), note('nas:stale', 300), note('nas:gone', 100)])
    const settled = (_daemon: string, session: string, since: number) =>
      session === 'gone' ? undefined : session === 'waiting' ? false : 200 >= since // the news is from 200
    renderHook(() => useCloseSettledNotifications(settled, 'v1'))
    await waitFor(() => expect(closed).toEqual(['nas:read']))
  })
})

describe('settledIn', () => {
  const settled = (s: Session) => !s.unread && !s.needs_attention
  const known = (sessions: Partial<Session>[], updatedAt = 2000) => ({ updatedAt, sessions: sessions as Session[] })

  it('a session seen and answered, archived, or gone from a newer list: its notification can go', () => {
    expect(settledIn(known([{ id: 'a', unread: false, needs_attention: false }]), 'a', 1000, settled)).toBe(true)
    expect(settledIn(known([{ id: 'a', unread: true, archived_at: '2026-11-13T00:00:00Z' }]), 'a', 1000, settled)).toBe(true)
    expect(settledIn(known([]), 'gone', 1000, settled)).toBe(true)
  })
  it('one still unread or waiting stays; a list older than the notification says nothing', () => {
    expect(settledIn(known([{ id: 'a', unread: true }]), 'a', 1000, settled)).toBe(false)
    expect(settledIn(known([], 500), 'gone', 1000, settled)).toBeUndefined()
    expect(settledIn(undefined, 'a', 1000, settled)).toBeUndefined()
  })
})
