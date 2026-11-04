import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerFrame } from '@/lib/api/types'
import { scenes } from './scenes'
import { DEMO_DAEMON } from './scenes/session'
import { WIDTH, plain } from './scenes/terminal'
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

  it('joins each session mid-task: earlier work in order, the screen and conversation alike', () => {
    const { w } = world()
    for (const session of w.sessions()) {
      const items = w.items(session.id)
      const seqs = items.map((i) => i.seq)
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
      expect(new Set(seqs).size).toBe(seqs.length)
      const screen = w.screen(session.id)
      if (session.capabilities.conversation) {
        expect(items.filter((i) => i.kind === 'prompt').length).toBeGreaterThanOrEqual(3)
        expect(items.filter((i) => i.kind === 'tool').length).toBeGreaterThanOrEqual(3)
      }
      if (screen && items.length) {
        const text = plain(screen).replace(/\s+/g, ' ')
        for (const item of items.filter((i) => i.kind === 'prompt')) expect(text).toContain(item.text)
      }
      if (screen) expect(plain(screen).split('\n').length).toBeGreaterThan(40)
    }
  })

  it('redraws a screen at the width it is resized to, and back once released', () => {
    const { w, frames } = world()
    const widest = (id: string) =>
      Math.max(
        ...plain(w.screen(id)!)
          .split('\n')
          .map((l) => l.length),
      )
    expect(widest('shop-api')).toBe(WIDTH)
    expect(w.resize('shop-api', 120)).toBe(true)
    expect(widest('shop-api')).toBe(120)
    expect(plain(w.screen('shop-api')!)).toContain('─'.repeat(120))
    const last = frames.at(-1)
    expect(last?.type === 'screen' && last.session_id === 'shop-api' && plain(last.ansi).includes('─'.repeat(120))).toBe(true)
    w.resize('shop-api', 5) // as narrow as allowed, never narrower
    expect(widest('shop-api')).toBeGreaterThan(5)
    w.resize('shop-api', null)
    expect(widest('shop-api')).toBe(WIDTH)
    expect(w.resize('release-notes', 80)).toBe(false) // no screen to size
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
    expect((await call(w, 'POST', '/v1/sessions/web-app/resize', { cols: 90, rows: 40 })).status).toBe(204)
    expect(plain((await (await call(w, 'GET', '/v1/sessions/web-app/screen')).json()).ansi)).toContain(`╭${'─'.repeat(88)}╮`)
    expect((await call(w, 'POST', '/v1/sessions/web-app/resize/release')).status).toBe(204)
    expect((await call(w, 'POST', '/v1/sessions/release-notes/resize', { cols: 90, rows: 40 })).status).toBe(409)
    const team = await (await call(w, 'PUT', '/v1/sessions/docs/team', { role: 'writer', note: '', rename_project: false })).json()
    expect([team.team_role, team.team_note]).toEqual(['writer', null])
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
