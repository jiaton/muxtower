/** The demo's Inbox: the owner's ideas across projects, as the hub keeps them (`/v1/inbox`, hand-off to a
 *  role or a session, each project's default hand-off role, due dates). Made up, every word; kept for the
 *  visit. The hub works days out in the owner's time zone; the demo in the browser's. */
import type { components } from '@/lib/api/schema'
import type { Session } from '@/lib/api/types'
import type { World } from './world'

type Item = components['schemas']['InboxItem']
type Target = components['schemas']['HandTarget']
type Store = { items: Item[]; next: number; handoff: Record<string, string>; task: number }

const STORES = new WeakMap<object, Store>()
/** A date alone falls due at this hour, the owner's time (the hub's `inbox.due_hour`). */
const DUE_HOUR = 9
const DAY_MS = 86_400_000

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const refuse = (status: number, detail: string) => json({ detail }, status)

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
/** `days` from today at the due hour (negative: before). */
function dayAt(days: number, hour = DUE_HOUR): string {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** none, upcoming, due (today, the owner's day) or overdue (a day before), as the hub says it. */
function dueState(item: Item, now = Date.now()): Item['due_state'] {
  if (!item.due || item.status === 'done') return 'none'
  const due = Date.parse(item.due)
  const today = startOfDay(now)
  if (startOfDay(due) < today) return 'overdue'
  if (startOfDay(due) === today) return due <= now || !item.due_has_time ? 'due' : 'upcoming'
  return 'upcoming'
}

const shown = (item: Item): Item => ({ ...item, due_state: dueState(item) })

type Seed = Partial<Item> & Pick<Item, 'text'> & { age: number }

function make(id: number, { age, ...fields }: Seed): Item {
  return {
    id, project: null, status: 'open', created_at: minutesAgo(age), updated_at: minutesAgo(age), order: id, version: 1,
    done_at: null, due: null, due_has_time: false, due_state: 'none', on_due: 'remind', due_target: null,
    due_fired_at: null, handed: null, ...fields,
  } // prettier-ignore
}

const SEEDS: Seed[] = [
  { text: 'Invoice PDFs should carry the customer’s VAT number when they gave one', project: 'acme/shop-api', age: 50, due: dayAt(-1) },
  { text: 'Refunds over 500 need a second approver', project: 'acme/billing', age: 30, due: dayAt(0, 17), due_has_time: true },
  { text: 'A dark theme for the billing page; support asked twice this week', project: 'acme/web-app', age: 1440, status: 'handed',
    handed: { to_role: 'worker', to_session: 'web-app', project: 'acme/web-app', task_id: 41, at: minutesAgo(120) } }, // prettier-ignore
  { text: 'Try a nightly job that warms the search cache before the morning traffic', age: 200, due: dayAt(3) },
  { text: 'The push opt-in screen asks too early; move it after the second order and measure the opt-in rate for a week before deciding',
    project: 'acme/mobile', age: 380 }, // prettier-ignore
  { text: 'Saved carts: keep them 30 days, and say so on the cart page', project: 'acme/shop-api', age: 2900, status: 'handed',
    handed: { to_role: null, to_session: 'shop-api', project: 'acme/shop-api', task_id: 37, at: minutesAgo(1500) } }, // prettier-ignore
  { text: 'Look into why the eval report takes 40 minutes', project: 'labs/ml-pipeline', age: 4300, due: dayAt(20),
    on_due: 'hand_off', due_target: { project: 'labs/ml-pipeline', role: 'ops', session_id: null } }, // prettier-ignore
  { text: 'A changelog page generated from merged pull requests', age: 9000 },
  { text: 'A pricing page that says what each plan includes', project: 'acme/marketing-site', age: 2000 },
  { text: 'Spacing tokens for the dense tables', project: 'labs/design-system', age: 700 },
  {
    text: 'Rename the staging bucket so it stops looking like production',
    project: 'acme/infra',
    age: 9000,
    status: 'done',
    done_at: minutesAgo(3000),
  },
  { text: 'Broken links in the API reference', project: 'acme/docs', age: 12000, status: 'done', done_at: minutesAgo(8000) },
]

function store(world: object): Store {
  let found = STORES.get(world)
  if (!found) {
    const empty = typeof location !== 'undefined' && /[?&]empty-inbox\b/.test(location.href)
    const items = empty ? [] : SEEDS.map((seed, i) => make(i + 1, seed))
    found = { items, next: items.length + 1, handoff: { 'acme/shop-api': 'tech lead' }, task: 100 }
    STORES.set(world, found)
  }
  return found
}

/** The project a session is listed under, as the hub groups it. */
function projectOf(s: Session): string | null {
  if (s.project && s.project_source !== 'folder') return s.project
  return s.git ? s.git.remote || s.git.repo.split('/').pop() || null : null
}
const roleName = (s: Session) => s.team_role?.split(/\s*[—–]\s*|\s+-\s+|\s*[:：（(]/)[0]?.trim() || null
const live = (world: World, project: string) => world.sessions().filter((s) => !s.archived_at && projectOf(s) === project)

function targets(world: World, project: string) {
  const sessions = live(world, project)
  const roles = new Map<string, { role: string; sessions: number }>()
  for (const s of sessions) {
    const role = roleName(s)
    if (!role) continue
    const key = role.toLowerCase()
    roles.set(key, { role: roles.get(key)?.role ?? role, sessions: (roles.get(key)?.sessions ?? 0) + 1 })
  }
  return {
    project,
    default_role: store(world).handoff[project] ?? null,
    roles: [...roles.values()].sort((a, b) => a.role.localeCompare(b.role)),
    sessions: sessions.map((s) => ({ id: s.id, name: s.name, role: roleName(s) })),
  }
}

/** Whom `target` names: one session, or why not (the hub's 409). */
function holder(world: World, target: Target): Session | string {
  const sessions = live(world, target.project)
  if (target.session_id) return sessions.find((s) => s.id === target.session_id) ?? `that session is not in ${target.project}`
  const role = target.role?.trim().toLowerCase()
  if (!role) return 'pick a role or a session'
  const holders = sessions.filter((s) => roleName(s)?.toLowerCase() === role)
  if (!holders.length) return `No one in ${target.project} holds the role ${target.role}`
  if (holders.length > 1)
    return `${holders.length} sessions in ${target.project} hold the role ${target.role}: ${holders.map((s) => s.name).join(', ')}`
  return holders[0]!
}

const ordered = (s: Store) => s.items.filter((i) => i.status !== 'done').sort((a, b) => a.order - b.order)
const recentDone = (s: Store) =>
  s.items
    .filter((i) => i.status === 'done' && i.done_at && Date.now() - Date.parse(i.done_at) < 30 * DAY_MS)
    .sort((a, b) => Date.parse(b.done_at!) - Date.parse(a.done_at!))
const inbox = (s: Store, done: boolean) => ({ items: ordered(s).map(shown), ...(done ? { done: recentDone(s).map(shown) } : {}) })

/** A due time as sent: with an offset, that instant; without one, the owner's (here the browser's) time; a
 *  date alone at the due hour. */
function dueOf(value: unknown, hasTime: unknown): { due: string | null; due_has_time: boolean } | string {
  if (value === null) return { due: null, due_has_time: false }
  if (typeof value !== 'string') return 'due must be a date and time'
  const timed = hasTime === undefined || hasTime === null ? /T\d/.test(value) : hasTime === true
  const at = new Date(value) // no offset: local time
  if (Number.isNaN(at.getTime())) return 'due must be a date and time'
  if (!timed) {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number)
    return { due: new Date(y!, m! - 1, d!, DUE_HOUR).toISOString(), due_has_time: false }
  }
  return { due: at.toISOString(), due_has_time: true }
}

/** The fields of a new item or a patch that set its due date and what happens then (a refusal: a string). */
function dueFields(body: Record<string, unknown>, item: Item): Partial<Item> | string {
  const out: Partial<Item> = {}
  if ('due' in body) {
    const due = dueOf(body.due, body.due_has_time)
    if (typeof due === 'string') return due
    Object.assign(out, due, { due_fired_at: null })
    if (due.due === null) Object.assign(out, { on_due: 'remind', due_target: null })
  }
  if (body.on_due === 'remind' || body.on_due === 'hand_off') out.on_due = body.on_due
  if ('due_target' in body) out.due_target = (body.due_target as Target | null) ?? null
  const next = { ...item, ...out }
  if (next.on_due === 'hand_off' && !next.due_target) return 'hand_off needs due_target'
  return out
}

/** Answers `/v1/inbox…` and `/v1/projects/{project}/handoff[-targets]`, or null for another path. */
export function inboxRoute(world: World, method: string, pathname: string, body: Record<string, unknown>, url: URL): Response | null {
  const s = store(world)
  const project = /^\/v1\/projects\/(.+)\/(handoff|handoff-targets)$/.exec(pathname)
  if (project) {
    const name = decodeURIComponent(project[1]!)
    if (project[2] === 'handoff-targets') return method === 'GET' ? json(targets(world, name)) : null
    if (method === 'GET') return json({ role: s.handoff[name] ?? null })
    if (method === 'PUT') {
      const role = typeof body.role === 'string' ? body.role.trim() : ''
      if (role) s.handoff[name] = role
      else delete s.handoff[name]
      return json({ role: s.handoff[name] ?? null })
    }
    return null
  }
  if (!pathname.startsWith('/v1/inbox')) return null
  if (pathname === '/v1/inbox' && method === 'GET') return json(inbox(s, ['1', 'true'].includes(url.searchParams.get('done') ?? '')))
  if (pathname === '/v1/inbox' && method === 'POST') {
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) return refuse(422, 'text is required')
    const item = make(s.next++, { text, age: 0, project: typeof body.project === 'string' ? body.project : null })
    const due = dueFields(body, item)
    if (typeof due === 'string') return refuse(422, due)
    Object.assign(item, due)
    item.order = Math.min(0, ...s.items.map((i) => i.order)) - 1
    s.items.push(item)
    return json(shown(item), 201)
  }
  if (pathname === '/v1/inbox/order' && method === 'PUT') {
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is number => typeof id === 'number') : []
    const rest = ordered(s).filter((i) => !ids.includes(i.id))
    ;[...ids.flatMap((id) => s.items.filter((i) => i.id === id)), ...rest].forEach((item, at) => (item.order = at))
    return json(inbox(s, false))
  }
  const one = /^\/v1\/inbox\/(\d+)(\/hand)?$/.exec(pathname)
  const item = one ? s.items.find((i) => i.id === Number(one[1])) : undefined
  if (!one) return null
  if (!item) return refuse(404, 'no such item')
  if (method === 'DELETE' && !one[2]) {
    s.items = s.items.filter((i) => i !== item)
    return new Response(null, { status: 204 })
  }
  if (method === 'PATCH' && !one[2]) {
    if (body.if_version !== item.version) return json({ detail: 'it changed since you read it', current: shown(item) }, 409)
    const due = dueFields(body, item)
    if (typeof due === 'string') return refuse(422, due)
    const patch: Partial<Item> = { ...due }
    if (typeof body.text === 'string' && body.text.trim()) patch.text = body.text.trim()
    if ('project' in body) patch.project = typeof body.project === 'string' && body.project ? body.project : null
    if (body.status === 'done') Object.assign(patch, { status: 'done', done_at: new Date().toISOString() })
    if (body.status === 'open') Object.assign(patch, { status: 'open', done_at: null, handed: null })
    Object.assign(item, patch, { version: item.version + 1, updated_at: new Date().toISOString() })
    return json(shown(item))
  }
  if (method === 'POST' && one[2]) {
    if (item.status === 'done') return refuse(409, 'It is done: open it again first')
    const target: Target = {
      project: String(body.project ?? ''),
      role: typeof body.role === 'string' ? body.role : null,
      session_id: typeof body.session_id === 'string' ? body.session_id : null,
    }
    const to = holder(world, target)
    if (typeof to === 'string') return refuse(409, to)
    world.deliver(to.id, item.text, "the owner's Inbox") // arrives as "[muxtower task from the owner's Inbox] <text>"
    const handed = {
      to_role: target.session_id ? null : target.role,
      to_session: to.id,
      project: target.project,
      task_id: ++s.task,
      at: new Date().toISOString(),
    }
    Object.assign(item, {
      status: 'handed',
      handed,
      project: item.project ?? target.project,
      version: item.version + 1,
      updated_at: handed.at,
    })
    return json(shown(item))
  }
  return null
}
