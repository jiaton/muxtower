import type { Session } from '@/lib/api/types'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCloseSettledNotifications, useNotificationClicks, settledIn } from './use-notifications'

const push = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ history: { push } }) }))

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
  it('goes where a notification tapped while the app is open points', () => {
    const container = browser([])
    renderHook(() => useNotificationClicks())
    container.dispatchEvent(new MessageEvent('message', { data: { type: 'navigate', url: '/d/nas/s/s2' } }))
    container.dispatchEvent(new MessageEvent('message', { data: { type: 'other' } }))
    expect(push.mock.calls).toEqual([['/d/nas/s/s2']])
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
