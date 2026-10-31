import type { components } from '@/lib/api/schema'
import type { NodeInfo, RuntimeInfo, Session } from '@/lib/api/types'
import { DEMO_DAEMON, NODE } from './scenes/session'
import { plain } from './scenes/terminal'
import type { World } from './world'

type Me = components['schemas']['Me']
type Handler = (world: World, id: string, body: Record<string, unknown>) => Response

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const empty = () => new Response(null, { status: 204 })
const refuse = (status: number, detail: string) => json({ detail }, status)
const NOT_IN_DEMO = 'Not part of the demo: on your own daemon this works.'

const ME: Me = {
  token_name: 'This browser',
  daemon_name: DEMO_DAEMON.name,
  features: { summaries: false, asr: false },
  claude_login_expired: false,
}
const RUNTIMES: RuntimeInfo[] = [
  { name: 'claude-code', binary: 'claude', available: true, has_hooks: true, headless: false },
  { name: 'codex', binary: 'codex', available: true, has_hooks: true, headless: false },
]
const NODES: NodeInfo[] = [
  {
    name: NODE,
    online: true,
    joined_at: '2026-01-05T09:00:00Z',
    last_seen: null,
    sessions: 1,
    version: null,
    update: null,
    runtimes: RUNTIMES,
  },
]

const marked =
  (patch: (body: Record<string, unknown>) => Partial<Session>): Handler =>
  (world, id, body) =>
    world.mark(id, patch(body)) ? empty() : refuse(404, 'no such session')

/** `METHOD /v1/sessions/{id}/<action>` → what it does to the session. */
const SESSION_ROUTES: Record<string, Handler> = {
  'GET ': (world, id) => {
    const session = world.session(id)
    return session ? json(session) : refuse(404, 'no such session')
  },
  'GET screen': (world, id) => {
    const screen = world.screen(id)
    if (screen === null) return refuse(409, 'this session has no screen')
    return json({ session_id: id, text: plain(screen), ansi: screen })
  },
  'GET conversation': (world, id) => {
    const items = world.items(id)
    return json({ session_id: id, items, latest_seq: items.at(-1)?.seq ?? 0 })
  },
  'POST approve': (world, id, body) => {
    const done = world.approve(id, typeof body.option === 'string' ? body.option : null)
    if (!done) return refuse(409, 'the session is not waiting for an answer')
    return json({ session_id: id, state: done.pending.state, option: done.option })
  },
  'POST deny': (world, id) => {
    const pending = world.deny(id)
    return pending ? json({ session_id: id, state: pending.state, option: null }) : refuse(409, 'nothing to deny')
  },
  'POST input': (world, id, body) => {
    world.input(id, typeof body.text === 'string' ? body.text : null, body.enter === true)
    return empty()
  },
  'POST read': marked((body) => ({ unread: body.read === false })),
  'POST hide': marked((body) => ({ hidden: body.hidden !== false })),
  'POST pin': marked((body) => ({ pinned: body.pinned !== false })),
  'POST archive': marked(() => ({ archived_at: new Date().toISOString() })),
  'PUT notify': (world, id, body) =>
    world.mark(id, { notify: (body.level as Session['notify']) ?? 'all' }) ? json(world.session(id)) : refuse(404, 'no such session'),
  'PATCH ': (world, id, body) => {
    const patch = typeof body.name === 'string' ? { name: body.name } : {}
    return world.mark(id, patch) ? json(world.session(id)) : refuse(404, 'no such session')
  },
  'DELETE ': (world, id) => (world.remove(id) ? empty() : refuse(404, 'no such session')),
  'POST resize': () => empty(),
  'POST resize/release': () => empty(),
}

const ROUTES: Record<string, (world: World) => Response> = {
  'GET /v1/me': () => json(ME),
  'GET /v1/health': () => json({ status: 'ok', version: 'demo' }),
  'GET /v1/sessions': (world) => json(world.sessions()),
  'GET /v1/runtimes': () => json(RUNTIMES),
  'GET /v1/nodes': () => json(NODES),
  'GET /v1/devices': () => json([{ name: 'This browser', created_at: new Date().toISOString(), last_used_at: null, current: true }]),
}

/** Answers a request to the demo daemon the way a daemon would, from `world`. */
export async function respond(world: World, request: Request): Promise<Response> {
  const { pathname } = new URL(request.url)
  const method = request.method.toUpperCase()
  const fixed = ROUTES[`${method} ${pathname}`]
  if (fixed) return fixed(world)
  const match = /^\/v1\/sessions\/([^/]+)(?:\/(.+))?$/.exec(pathname)
  const handler = match && SESSION_ROUTES[`${method} ${match[2] ?? ''}`]
  if (!match || !handler) return refuse(409, NOT_IN_DEMO)
  const text = method === 'GET' ? '' : await request.text()
  let body: Record<string, unknown> = {}
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    return refuse(422, 'not JSON')
  }
  return handler(world, decodeURIComponent(match[1]), body)
}
