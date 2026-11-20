import { describe, expect, it, vi, type Mock } from 'vitest'
import { appBaseOf, isAppWindow, openFromNotification, sortWindows, type AppWindow } from './push-click'

const BASE = 'https://app.example/'
const TARGET = '/d/hub-7f3a/s/sess-secret-42'

interface Fake extends AppWindow {
  focus: Mock<AppWindow['focus']>
  postMessage: Mock<AppWindow['postMessage']>
}

/** A window on the origin; `answers`: the app in it says it went where it was told. */
function win(path: string, opts: { focused?: boolean; visible?: boolean; answers?: boolean; focus?: () => Promise<unknown>; navigate?: (url: string) => Promise<unknown> } = {}): Fake {
  const w: Fake = {
    url: new URL(path, BASE).href,
    focused: opts.focused ?? false,
    visibilityState: (opts.visible ?? opts.focused) ? 'visible' : 'hidden',
    focus: vi.fn(opts.focus ?? (async () => w)),
    postMessage: vi.fn((_message: unknown, transfer: Transferable[]) => {
      if (opts.answers) (transfer[0] as MessagePort).postMessage({ type: 'navigated' })
    }),
    ...(opts.navigate ? { navigate: opts.navigate } : {}),
  }
  return w
}

const env = () => ({ openWindow: vi.fn(async () => null), id: 'c1' })

describe('a tapped notification', () => {
  it('the app open and focused: told where to go, it answers, and is brought forward', async () => {
    const app = win('/d/hub-7f3a/s/other', { focused: true, answers: true })
    const e = env()
    const record = await openFromNotification(TARGET, [app], BASE, e)
    expect(app.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'navigate', url: TARGET, click: expect.objectContaining({ id: 'c1', stage: 'sw' }) }),
      [expect.anything()],
    )
    expect(app.postMessage.mock.invocationCallOrder[0]).toBeLessThan(app.focus.mock.invocationCallOrder[0]!)
    expect(e.openWindow).not.toHaveBeenCalled()
    expect(record).toMatchObject({ message: 'sent', ack: true, focus: 'ok', fallback: 'none', chosen: 0 })
    expect(record.ackMs).toBeGreaterThanOrEqual(0)
  })

  it('the app in the background: the best of its windows goes there and is brought forward', async () => {
    const hidden = win('/', { answers: true })
    const visible = win('/daemons', { visible: true, answers: true })
    const e = env()
    const record = await openFromNotification(TARGET, [hidden, visible], BASE, e)
    expect(visible.postMessage).toHaveBeenCalled()
    expect(visible.focus).toHaveBeenCalled()
    expect(hidden.postMessage).not.toHaveBeenCalled()
    expect(e.openWindow).not.toHaveBeenCalled()
    expect(record).toMatchObject({ ack: true, focus: 'ok', fallback: 'none' })
    expect(record.windows.map((w) => w.path)).toEqual(['/daemons', '/'])
  })

  it('no app window (only the glasses page): a new window opens on it', async () => {
    const e = env()
    const record = await openFromNotification(TARGET, [win('/g2/')], BASE, e)
    expect(e.openWindow).toHaveBeenCalledWith(TARGET)
    expect(record).toMatchObject({ windows: [], chosen: null, message: 'none', ack: null, fallback: 'open' })
    expect(record.others).toEqual([{ path: '/g2/', visibility: 'hidden', focused: false }])
  })

  it('no answer from a window this worker does not control: the one window interaction opens a window', async () => {
    const deaf = win('/', { focused: true, navigate: async () => Promise.reject(new TypeError('not controlled')) })
    const e = env()
    const record = await openFromNotification(TARGET, [deaf], BASE, { ...e, ackMs: 30 })
    expect(e.openWindow).toHaveBeenCalledWith(TARGET)
    expect(deaf.focus).not.toHaveBeenCalled() // focus() would use up what openWindow() needs
    expect(record).toMatchObject({ message: 'sent', ack: false, ackMs: null, focus: 'skipped', fallback: 'open' })
  })

  it('no answer from a window it controls: navigated, then brought forward', async () => {
    const navigate = vi.fn(async () => null)
    const deaf = win('/', { navigate })
    const e = env()
    const record = await openFromNotification(TARGET, [deaf], BASE, { ...e, ackMs: 30 })
    expect(navigate).toHaveBeenCalledWith(TARGET)
    expect(deaf.focus).toHaveBeenCalled()
    expect(e.openWindow).not.toHaveBeenCalled()
    expect(record).toMatchObject({ ack: false, fallback: 'navigate', focus: 'ok' })
  })

  it('a window that will not come forward is not waited on', async () => {
    const stuck = win('/', { answers: true, focus: () => new Promise(() => {}) })
    const record = await openFromNotification(TARGET, [stuck], BASE, { ...env(), focusMs: 30 })
    expect(record).toMatchObject({ ack: true, focus: 'timeout' })
  })

  it('a failed openWindow is recorded, not thrown', async () => {
    const record = await openFromNotification(TARGET, [], BASE, { openWindow: async () => Promise.reject(new Error('Not allowed')) })
    expect(record.fallback).toBe('open-failed')
  })

  it('the record holds route patterns, visibility and timings: no ids, names or text', async () => {
    const app = win('/d/hub-7f3a/s/sess-other-9?view=all#q', { focused: true, answers: true })
    const record = await openFromNotification(`${TARGET}?q=secret-text`, [app, win('/g2/hub-7f3a')], BASE, env())
    expect(Object.keys(record).sort()).toEqual(
      ['ack', 'ackMs', 'at', 'base', 'chosen', 'fallback', 'focus', 'id', 'message', 'ms', 'others', 'stage', 'target', 'windows'].sort(),
    )
    expect(record.target).toBe('/d/:daemon/s/:session')
    expect(record.windows).toEqual([{ path: '/d/:daemon/s/:session', visibility: 'visible', focused: true }])
    expect(record.others).toEqual([{ path: '/g2/:id', visibility: 'hidden', focused: false }])
    const text = JSON.stringify(record)
    for (const secret of ['hub-7f3a', 'sess-secret-42', 'sess-other-9', 'secret-text', 'view=all']) expect(text).not.toContain(secret)
  })
})

describe("which windows are the app's", () => {
  it('the base comes from a push registration’s scope, or the root one', () => {
    expect(appBaseOf('https://app.example/push/hub-7f3a/')).toBe('https://app.example/')
    expect(appBaseOf('https://app.example/sub/push/hub-7f3a/')).toBe('https://app.example/sub/')
    expect(appBaseOf('https://app.example/sub/push/hub-7f3a')).toBe('https://app.example/sub/')
    expect(appBaseOf('https://app.example/sub/')).toBe('https://app.example/sub/')
    expect(appBaseOf('https://app.example/sub')).toBe('https://app.example/sub/')
  })

  it('a page at or under the base, with or without its trailing slash; never the glasses or push paths', () => {
    const base = 'https://app.example/sub/'
    expect(isAppWindow('https://app.example/sub', base)).toBe(true)
    expect(isAppWindow('https://app.example/sub/', base)).toBe(true)
    expect(isAppWindow('https://app.example/sub/d/x/s/y?v=1#h', base)).toBe(true)
    expect(isAppWindow('https://app.example/sub/g2', base)).toBe(false)
    expect(isAppWindow('https://app.example/sub/g2/', base)).toBe(false)
    expect(isAppWindow('https://app.example/sub/push/x/', base)).toBe(false)
    expect(isAppWindow('https://app.example/subway', base)).toBe(false)
    expect(isAppWindow('https://app.example/', base)).toBe(false)
    expect(isAppWindow('https://other.example/sub/', base)).toBe(false)
    expect(isAppWindow('not a url', base)).toBe(false)
    expect(isAppWindow('https://app.example/sub', 'https://app.example/sub')).toBe(true) // a base without its slash
    expect(isAppWindow('https://app.example/d/x', 'https://app.example/')).toBe(true)
    expect(isAppWindow('https://app.example/g2x', 'https://app.example/')).toBe(true)
  })

  it('the focused window first, then a visible one, then the rest', () => {
    const hidden = win('/a')
    const visible = win('/b', { visible: true })
    const focused = win('/c', { focused: true })
    expect(sortWindows([hidden, visible, focused, win('/g2/')], BASE).windows).toEqual([focused, visible, hidden])
  })
})
