import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerFrame } from '@/lib/api/types'
import { scenes } from './scenes'
import { DEMO_DAEMON } from './scenes/session'
import { respond } from './server'
import { DemoSocket } from './socket'
import { World } from './world'

/** A world whose scripted steps run only when the test says so. */
function world() {
  const due: (() => void)[] = []
  const w = new World(scenes(), (run) => void due.push(run))
  const frames: ServerFrame[] = []
  w.listen((frame) => frames.push(frame))
  const runAll = () => {
    while (due.length) due.shift()!()
  }
  return { w, frames, runAll }
}

const call = (w: World, method: string, path: string, body?: unknown) =>
  respond(w, new Request(`${DEMO_DAEMON.url}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }))

describe('the demo world', () => {
  it('plays the approval story: busy, the tests, then a finished turn', () => {
    const { w, frames, runAll } = world()
    runAll() // the working agent's own story
    expect(w.approve('shop-api', null)?.option).toBe('2') // the recommended choice
    runAll()
    const session = w.session('shop-api')!
    expect([session.state, session.pending, session.needs_attention, session.unread]).toEqual(['idle', null, false, true])
    expect(w.screen('shop-api')).toContain('42 passed')
    expect(w.items('shop-api').at(-1)?.text).toContain('All 42 payment tests pass')
    expect(frames.some((f) => f.type === 'screen' && f.session_id === 'shop-api')).toBe(true)
    expect(w.approve('shop-api', null)).toBeNull() // nothing asked any more
  })

  it('answers a message and says it is a demo', () => {
    const { w, runAll } = world()
    w.input('release-notes', 'ship it', true)
    w.input('release-notes', 'typed but not sent', false)
    runAll()
    expect(
      w
        .items('release-notes')
        .map((i) => i.text)
        .slice(-2),
    ).toEqual(['ship it', expect.stringContaining('demo')])
  })
})

describe('the demo daemon over HTTP', () => {
  it('answers what the app asks, as a daemon would', async () => {
    const { w } = world()
    expect((await (await call(w, 'GET', '/v1/sessions')).json()).map((s: { id: string }) => s.id)).toEqual([
      'shop-api',
      'web-app',
      'docs',
      'laptop~infra',
      'release-notes',
      'release-notes-fork',
      'laptop~migrations',
      'old-1',
      'old-2',
      'laptop~old-3',
    ])
    const screen = await (await call(w, 'GET', '/v1/sessions/shop-api/screen')).json()
    expect(screen.text).toContain('Do you want to proceed?')
    expect(screen.text).not.toContain('\x1b')
    expect((await call(w, 'GET', '/v1/sessions/release-notes/screen')).status).toBe(409)
    expect(await (await call(w, 'POST', '/v1/sessions/web-app/approve', { option: '3' })).json()).toMatchObject({
      option: '3',
    })
    expect((await call(w, 'POST', '/v1/sessions/web-app/approve', {})).status).toBe(409)
    expect((await call(w, 'POST', '/v1/sessions/docs/read', { read: true })).status).toBe(204)
    expect((await call(w, 'POST', '/v1/sessions', { runtime: 'claude' })).status).toBe(409)
    expect((await (await call(w, 'GET', '/v1/sessions/shop-api/tasks')).json())[0].from_id).toBe('release-notes')
    const team = await (await call(w, 'PUT', '/v1/sessions/docs/team', { role: 'writer', note: '', rename_project: false })).json()
    expect([team.team_role, team.team_note]).toEqual(['writer', null])
    const asked = await (await call(w, 'GET', '/v1/recovery')).json()
    expect(asked.sessions.map((s: { id: string }) => s.id)).toEqual(['laptop~migrations'])
    const [started] = await (await call(w, 'POST', '/v1/recovery', { session_ids: ['laptop~migrations', 'docs'] })).json()
    expect([started.id, started.interrupted_at, started.capabilities.screen]).toEqual(['laptop~migrations', null, true])
    expect(await (await call(w, 'POST', '/v1/recovery', { session_ids: ['laptop~migrations'] })).json()).toEqual([])
  })
})

describe('the demo stream', () => {
  afterEach(() => vi.useRealTimers())

  it('opens, sends what is subscribed and follows changes', () => {
    vi.useFakeTimers()
    const { w } = world()
    const socket = new DemoSocket(w)
    const got: ServerFrame[] = []
    socket.onmessage = (event) => got.push(JSON.parse(String(event.data)))
    vi.runAllTimers()
    expect(socket.readyState).toBe(DemoSocket.OPEN)
    socket.send(JSON.stringify({ type: 'subscribe', topic: 'screen', session_id: 'shop-api' }))
    w.mark('docs', { pinned: true }) // the session list: not subscribed
    vi.runAllTimers()
    expect(got.map((f) => f.type)).toEqual(['screen'])
    socket.close()
    expect(socket.readyState).toBe(DemoSocket.CLOSED)
  })
})
