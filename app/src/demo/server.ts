import { playbook, save, versions } from './playbook'
import type { components } from '@/lib/api/schema'
import { APP_VERSION } from '@/lib/app-update'
import type { MachineUsage, NodeInfo, RuntimeInfo, Session, TeamTask } from '@/lib/api/types'
import { DEMO_DAEMON, HOME, NODE } from './scenes/session'
import { startedScene } from './scenes/started'
import { plain } from './scenes/terminal'
import { DemoSettings } from './settings'
import { dictionary, saveDictionary } from './dictionary'
import { triggers } from './triggers'
import { keptSpoken, speakLatest } from './spoken'
import { withAttachments } from './upload'
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
  version: APP_VERSION || null,
  default_folder: `${HOME}/code`,
  // Voice (Live) shows only for the site's clip recorder, which drives it without a microphone (install.ts).
  features: { summaries: false, asr: typeof location !== 'undefined' && new URLSearchParams(location.search).has('clip') },
  claude_login_expired: false,
}
const RUNTIMES: RuntimeInfo[] = [
  {
    name: 'claude-code', binary: 'claude', available: true, has_hooks: true, headless: false, default_mode: 'agent',
    permission_modes: [
      { id: 'plan', label: 'Plan first', dangerous: false },
      { id: 'default', label: 'Ask before acting', dangerous: false },
      { id: 'acceptEdits', label: 'Accept edits', dangerous: false },
      { id: 'auto', label: 'Auto', dangerous: false },
      { id: 'bypassPermissions', label: 'Bypass permissions', dangerous: true },
    ],
  }, // prettier-ignore
  {
    name: 'codex', binary: 'codex', available: true, has_hooks: true, headless: false, default_mode: 'agent',
    permission_modes: [
      { id: 'untrusted', label: 'Ask for all but safe reads', dangerous: false },
      { id: 'on-request', label: 'Ask when it wants to', dangerous: false },
      { id: 'full-auto', label: 'Sandboxed, never ask', dangerous: false },
      { id: 'full-access', label: 'Full access, no sandbox', dangerous: true },
    ],
  }, // prettier-ignore
]
const NODES: NodeInfo[] = [
  {
    name: NODE,
    online: true,
    joined_at: '2026-01-05T09:00:00Z',
    last_seen: null,
    sessions: 1,
    version: APP_VERSION || null,
    default_folder: '/Users/dev/code',
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

/** The owner's groups of projects (the second chip row), kept for this visit. */
type ChipGroup = { id: string; name: string; projects: string[]; sessions: string[]; roles?: string[] }
const CHIP_GROUPS = new WeakMap<World, ChipGroup[]>()
const STARTING_GROUPS: ChipGroup[] = [
  { id: 'product', name: 'Product', projects: ['acme/shop-api', 'acme/web-app'], sessions: [] },
  { id: 'ops', name: 'Ops', projects: ['acme/infra', ':other'], sessions: [] },
  { id: 'pms', name: 'PMs', projects: [], sessions: [], roles: ['pm'] },
]
const chipGroups = (world: World) => CHIP_GROUPS.get(world) ?? STARTING_GROUPS

/** The owner's order of projects (grouped by project): not by name, so the list shows it is theirs. */
const PROJECT_ORDER = new WeakMap<World, string[]>()
const STARTING_ORDER = ['acme/web-app', 'acme/shop-api', 'acme/infra']
const projectOrder = (world: World) => PROJECT_ORDER.get(world) ?? STARTING_ORDER

/** Each project's colour (`--color-project-N`), as the hub keeps it: a project it lists first gets the hue
 *  fewest have (the lowest on a tie); the reader's picks are kept for this visit. */
const PROJECT_HUES = 6
const PROJECT_COLOURS = new WeakMap<World, Record<string, number>>()
const STARTING_COLOURS: Record<string, number> = {
  'acme/web-app': 1,
  'acme/shop-api': 2,
  'acme/infra': 3,
  'acme/docs': 4,
  'acme/mobile': 5,
  'labs/ml-pipeline': 6,
  'labs/design-system': 1,
  'personal/dotfiles': 2,
}
function projectColours(world: World): Record<string, number> {
  const hues = { ...(PROJECT_COLOURS.get(world) ?? STARTING_COLOURS) }
  for (const s of world.sessions()) {
    const project = s.project && s.project_source !== 'folder' ? s.project : s.git ? s.git.remote || s.git.repo.split('/').pop() : null
    if (!project || project in hues) continue
    const used = Object.values(hues)
    const count = (h: number) => used.filter((u) => u === h).length
    hues[project] = Array.from({ length: PROJECT_HUES }, (_, i) => i + 1).reduce((a, b) => (count(b) < count(a) ? b : a))
  }
  PROJECT_COLOURS.set(world, hues)
  return hues
}

/** How many sessions the reader has started in this visit (for their ids). */
const STARTED = new WeakMap<World, number>()

/** `POST /v1/sessions`: a made-up session where the reader asked, playing its first message if given. */
function start(world: World, body: Record<string, unknown>): Response {
  const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : null)
  const runtime = text('runtime')
  if (!runtime || !RUNTIMES.some((r) => r.name === runtime)) return refuse(422, 'no such runtime')
  const node = text('node')
  if (node && !NODES.some((n) => n.name === node)) return refuse(404, `no node named ${node}`)
  const n = (STARTED.get(world) ?? 0) + 1
  STARTED.set(world, n)
  const scene = startedScene({ runtime, node, cwd: text('cwd'), name: text('name') }, world.sessions(), n)
  world.add(scene)
  const prompt = text('prompt')?.trim()
  if (prompt) world.input(scene.session.id, prompt, true)
  return json(world.session(scene.session.id), 201)
}

/** The names each demo session went by before the one it has: its agent's, then each it was renamed from. */
const EARLIER = new WeakMap<World, Map<string, { name: string; source: string; last_seen: string }[]>>()

function earlier(world: World, id: string) {
  const all = EARLIER.get(world) ?? new Map()
  EARLIER.set(world, all)
  if (!all.has(id)) all.set(id, [])
  return all.get(id) as { name: string; source: string; last_seen: string }[]
}

function namesOf(world: World, id: string, current: Session) {
  const agent = current.agent_name ? [{ name: current.agent_name, source: 'claude', last_seen: current.updated_at }] : []
  const seen = new Set([current.name])
  return [...earlier(world, id), ...agent].filter((n) => !seen.has(n.name) && seen.add(n.name)).slice(0, 10)
}

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
    // A held message has no default: Deliver or Deny is picked.
    if (world.session(id)?.pending?.kind === 'peer_message' && typeof body.option !== 'string') return refuse(422, 'pick Deliver or Deny')
    const done = world.approve(id, typeof body.option === 'string' ? body.option : null)
    if (!done) return refuse(409, 'the session is not waiting for an answer')
    return json({ session_id: id, state: done.pending.state, option: done.option })
  },
  'POST deny': (world, id) => {
    const pending = world.deny(id)
    return pending ? json({ session_id: id, state: pending.state, option: null }) : refuse(409, 'nothing to deny')
  },
  'POST input': (world, id, body) => {
    world.input(id, withAttachments(world, typeof body.text === 'string' ? body.text : null, body.attachments), body.enter === true)
    return empty()
  },
  // The suggested prompt taken (→ then Enter there): sent like one typed, and gone from the input line.
  'POST suggestion': (world, id, body) => {
    world.mark(id, { suggestion: null })
    world.input(id, typeof body.text === 'string' ? body.text : null, true)
    return empty()
  },
  'POST read': marked((body) => ({ unread: body.read === false })),
  'POST hide': marked((body) => ({ hidden: body.hidden !== false })),
  'POST pin': marked((body) => ({ pinned: body.pinned !== false })),
  'POST archive': marked(() => ({ archived_at: new Date().toISOString() })),
  'POST resume': (world, id) => {
    const session = world.session(id)
    if (!session) return refuse(404, 'no such session')
    if (!session.archived_at || !session.capabilities.resume) return refuse(409, session.resume_blocked?.reason ?? 'it cannot be resumed')
    world.resume(id)
    return json(world.session(id))
  },
  'PUT notify': (world, id, body) =>
    world.mark(id, { notify: (body.level as Session['notify']) ?? 'all' }) ? json(world.session(id)) : refuse(404, 'no such session'),
  'PUT auto-read': (world, id, body) =>
    world.mark(id, body.auto_read === true ? { auto_read: true, unread: false } : { auto_read: false })
      ? json(world.session(id))
      : refuse(404, 'no such session'),
  'GET names': (world, id) => {
    const session = world.session(id)
    return session ? json(namesOf(world, id, session)) : refuse(404, 'no such session')
  },
  'PATCH ': (world, id, body) => {
    const patch = typeof body.name === 'string' ? { name: body.name } : {}
    const before = world.session(id)
    if (before && patch.name && patch.name !== before.name) {
      earlier(world, id).unshift({ name: before.name, source: 'muxtower', last_seen: new Date().toISOString() })
    }
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
  // Play: a made-up summary of the latest reply, kept per reply (`spoken.ts`).
  'GET spoken': (world, id) => (world.session(id) ? json(keptSpoken(world, id)) : refuse(404, 'no such session')),
  'POST spoken': (world, id) => {
    if (!world.session(id)) return refuse(404, 'no such session')
    const spoken = speakLatest(world, id)
    return spoken ? json(spoken) : refuse(404, 'this session has no reply to say')
  },
  'GET tasks': (world, id) => (world.session(id) ? json(world.tasks(id)) : refuse(404, 'no such session')),
  'DELETE ': (world, id) => (world.remove(id) ? empty() : refuse(404, 'no such session')),
  'POST resize': (world, id, body) => {
    if (typeof body.cols !== 'number' || !Number.isFinite(body.cols)) return refuse(422, 'cols must be a number')
    return world.resize(id, body.cols) ? empty() : refuse(409, 'this session has no screen')
  },
  'POST resize/release': (world, id) => (world.resize(id, null) ? empty() : refuse(409, 'this session has no screen')),
}

const ROUTES: Record<string, (world: World, body: Record<string, unknown>, url: URL) => Response> = {
  'GET /v1/me': () => json(ME),
  'GET /v1/chip-groups': (world) => json({ groups: chipGroups(world) }),
  'GET /v1/tasks/latest': (world, _, url) =>
    json(
      Object.fromEntries(
        url.searchParams.getAll('to').flatMap((id) => {
          const sent = world.tasks(id).filter((t) => t.to_id === id)
          return sent.length ? [[id, sent[0]]] : []
        }),
      ),
    ),
  'PUT /v1/chip-groups': (world, body) => {
    CHIP_GROUPS.set(world, Array.isArray(body.groups) ? (body.groups as ChipGroup[]) : [])
    return json({ groups: chipGroups(world) })
  },
  'GET /v1/project-order': (world) => json({ projects: projectOrder(world) }),
  'PUT /v1/project-order': (world, body) => {
    const projects = Array.isArray(body.projects) ? body.projects.filter((p): p is string => typeof p === 'string') : []
    PROJECT_ORDER.set(world, [...new Set(projects)])
    return json({ projects: projectOrder(world) })
  },
  'GET /v1/project-colours': (world) => json({ hues: projectColours(world) }),
  'PUT /v1/project-colours': (world, body) => {
    const hue = Number(body.hue)
    if (typeof body.project !== 'string' || !body.project.trim() || !Number.isInteger(hue) || hue < 1 || hue > PROJECT_HUES)
      return json({ detail: 'a project and a hue, 1 to 6' }, 422)
    PROJECT_COLOURS.set(world, { ...projectColours(world), [body.project]: hue })
    return json({ hues: projectColours(world) })
  },
  'GET /v1/health': () => json({ status: 'ok', version: 'demo' }),
  'GET /v1/search/status': () =>
    json({ here: { state: 'caught_up', size_bytes: 3_200_000 }, nodes: [{ node: 'laptop', status: { state: 'off', size_bytes: 0 } }] }),
  // Full-text search, faked over the demo's own made-up conversations.
  'GET /v1/search': (world, _, url) => {
    const q = (url.searchParams.get('q') ?? '').toLowerCase().trim()
    const hits = world.sessions().flatMap((s) =>
      world
        .items(s.id)
        .filter((i) => (i.kind === 'prompt' || i.kind === 'reply') && q && (i.text ?? '').toLowerCase().includes(q))
        .map((i) => {
          const text = i.text ?? ''
          const at = text.toLowerCase().indexOf(q)
          const from = Math.max(0, at - 40)
          return {
            session_id: s.id,
            seq: i.seq,
            at: i.at,
            role: i.kind === 'prompt' ? 'user' : 'agent',
            archived: Boolean(s.archived_at),
            node: s.node ?? null,
            snippet: [
              { text: (from ? '…' : '') + text.slice(from, at), match: false },
              { text: text.slice(at, at + q.length), match: true },
              { text: text.slice(at + q.length, at + q.length + 60) + '…', match: false },
            ],
          }
        }),
    )
    return json({ hits: hits.slice(0, 12), late: [], off: false, took_ms: 1 })
  },
  'GET /v1/sessions': (world) => json(world.sessions()),
  'POST /v1/sessions': start,
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
  'GET /v1/asr/dictionary': () => json(dictionary()),
  'PUT /v1/asr/dictionary': (_, body) => json(saveDictionary(body)),
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
/** A project's team at work, as the daemon answers it: its sessions' tasks, sent or received. */
function projectActivity(world: World, project: string) {
  const members = world
    .sessions()
    .filter((s) => s.project === project && !s.archived_at)
    .map((s) => s.id)
  const seen = new Map<number, TeamTask>()
  for (const id of world.sessions().map((s) => s.id))
    for (const t of world.tasks(id)) if (members.includes(t.to_id) || members.includes(t.from_id ?? '')) seen.set(t.id, t)
  return { project, members, tasks: [...seen.values()].sort((a, b) => a.at.localeCompare(b.at)), messages: [] }
}

export async function respond(world: World, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const { pathname } = url
  const method = request.method.toUpperCase()
  const activity = method === 'GET' ? /^\/v1\/projects\/(.+)\/activity$/.exec(pathname) : null
  if (activity) return json(projectActivity(world, decodeURIComponent(activity[1]!)))
  const book = /^\/v1\/playbook\/(.+?)(\/versions|\/revert)?$/.exec(pathname)
  if (method === 'GET' && pathname === '/v1/playbook')
    return json(playbook(world, url.searchParams.has('effective_for') ? (url.searchParams.get('effective_for') ?? '') : null))
  if (book) {
    const scope = decodeURIComponent(book[1]!)
    if (method === 'GET' && book[2] === '/versions') return json(versions(world, scope))
    const body = JSON.parse((await request.text()) || '{}') as Record<string, unknown>
    if (method === 'POST' && book[2] === '/revert') {
      const old = versions(world, scope).find((v) => v.version === body.version)
      const now = versions(world, scope)[0]
      const saved = old && now && save(world, scope, old.text, old.mode, now.version, `reverted to v${old.version}`)
      return saved ? json(saved) : refuse(404, 'no such version')
    }
    if (method === 'PUT') {
      const saved = save(world, scope, String(body.text ?? ''), body.mode === 'replace' ? 'replace' : 'add', Number(body.base_version))
      return saved ? json(saved) : refuse(409, 'the playbook was changed since: reload it and edit again')
    }
  }
  if (pathname.startsWith('/v1/triggers')) {
    const sent = method === 'GET' || method === 'DELETE' ? '' : await request.text()
    let body: Record<string, unknown> = {}
    try {
      body = sent ? (JSON.parse(sent) as Record<string, unknown>) : {}
    } catch {
      return refuse(422, 'not JSON')
    }
    const answer = triggers(world, method, pathname, body)
    if (answer) return answer
  }
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
