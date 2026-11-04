import type { components } from '@/lib/api/schema'
import type { MachineUsage, NodeInfo, RuntimeInfo, Session } from '@/lib/api/types'
import { DEMO_DAEMON, NODE } from './scenes/session'
import { plain } from './scenes/terminal'
import { DemoSettings } from './settings'
import type { World } from './world'

type Me = components['schemas']['Me']
type Handler = (world: World, id: string, body: Record<string, unknown>) => Response

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const empty = () => new Response(null, { status: 204 })
const refuse = (status: number, detail: string) => json({ detail }, status)
const NOT_IN_DEMO = 'Not part of the demo: on your own daemon this works.'
const SETTINGS = new DemoSettings()

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
    reported_url: 'https://laptop.demo.invalid',
    direct_url: null,
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
  'PUT team': (world, id, body) => {
    const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string).trim() || null : undefined)
    const patch: Partial<Session> = {}
    if (text('role') !== undefined) patch.team_role = text('role')
    if (text('note') !== undefined) patch.team_note = text('note')
    if (text('project')) patch.project = text('project')
    return world.mark(id, patch) ? json(world.session(id)) : refuse(404, 'no such session')
  },
  'GET tasks': (world, id) => (world.session(id) ? json(world.tasks(id)) : refuse(404, 'no such session')),
  'DELETE ': (world, id) => (world.remove(id) ? empty() : refuse(404, 'no such session')),
  'POST resize': () => empty(),
  'POST resize/release': () => empty(),
}

const ROUTES: Record<string, (world: World, body: Record<string, unknown>, url: URL) => Response> = {
  'GET /v1/me': () => json(ME),
  'GET /v1/health': () => json({ status: 'ok', version: 'demo' }),
  'GET /v1/sessions': (world) => json(world.sessions()),
  'GET /v1/runtimes': () => json(RUNTIMES),
  'GET /v1/nodes': () => json(NODES),
  'GET /v1/devices': () => json([{ name: 'This browser', created_at: new Date().toISOString(), last_used_at: null, current: true }]),
  'GET /v1/usage': () => json(USAGE()),
  'GET /v1/settings': (_, __, url) => json(SETTINGS.list(url.searchParams.get('node') || DEMO_DAEMON.name)),
  'PATCH /v1/settings': (_, body, url) => {
    const refused = SETTINGS.change((body.values ?? {}) as Record<string, unknown>)
    return refused ? refuse(409, refused) : json(SETTINGS.list(url.searchParams.get('node') || DEMO_DAEMON.name))
  },
  'POST /v1/nodes/direct': () => json([{ node: NODE, url: 'https://laptop.demo.invalid', token: 'demo-direct' }]),
  'GET /v1/recovery': (world) => json({ mode: 'ask', sessions: world.sessions().filter((s) => s.interrupted_at) }),
  'POST /v1/recovery': (world, body) =>
    json(world.recover(Array.isArray(body.session_ids) ? body.session_ids.filter((id) => typeof id === 'string') : [])),
}

/** What the demo's two machines use: little, as a daemon should. */
const USAGE = (): MachineUsage[] =>
  [
    ['build-box', 1.8, 2.1, 46, 4.2],
    ['laptop', 0.9, 1.2, 38, 2.7],
  ].map(([machine, cpu1, cpu10, rss, tick]) => ({
    machine: machine as string, sampled_at: new Date().toISOString(), stale: false, cpu_1m: cpu1 as number,
    cpu_10m: cpu10 as number, rss_mb: rss as number, peak_rss_mb: null, threads: 14, open_files: 31, children: [],
    tick: { avg_ms: tick as number, max_ms: (tick as number) * 2, slowest: null }, alerts: [],
  })) // prettier-ignore

/** Answers a request to the demo daemon the way a daemon would, from `world`. */
export async function respond(world: World, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const { pathname } = url
  const method = request.method.toUpperCase()
  const fixed = ROUTES[`${method} ${pathname}`]
  const match = /^\/v1\/sessions\/([^/]+)(?:\/(.+))?$/.exec(pathname)
  const handler = match && SESSION_ROUTES[`${method} ${match[2] ?? ''}`]
  if (!fixed && (!match || !handler)) return refuse(409, NOT_IN_DEMO)
  const text = method === 'GET' ? '' : await request.text()
  let body: Record<string, unknown> = {}
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    return refuse(422, 'not JSON')
  }
  return fixed ? fixed(world, body, url) : handler!(world, decodeURIComponent(match![1]), body)
}
