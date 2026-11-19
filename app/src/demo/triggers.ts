/** The demo's triggers: made-up examples (never anyone's own), their firings, kept for the visit. */
import type { Firing, Trigger, TriggerAction, TriggerCondition, TriggerPatch, TriggerSpec } from '@/lib/api/types'
import { ago } from './scenes/session'

type Store = { triggers: Trigger[]; firings: Firing[]; next: number }
const STORES = new WeakMap<object, Store>()

const trigger = (id: string, action: TriggerAction, more: Partial<Trigger>): Trigger => ({
  id, name: id, action, enabled: true, filter: [], dedupe: null, rate_per_hour: null, source: { kind: 'webhook' },
  created_at: ago(9 * 1440), updated_at: ago(3 * 1440), last_fired_at: null, last_outcome: null, ...more,
}) // prettier-ignore

/** Its firings, oldest first: [minutes ago, outcome, via, target, detail]. */
type Seed = [number, Firing['outcome'], Firing['via'], string | null, string | null]

function seed(store: Store, id: string, rows: Seed[]) {
  for (const [minutes, outcome, via, target, detail] of rows)
    store.firings.push({ id: store.next++, trigger_id: id, at: ago(minutes), outcome, via, target, detail, bytes: 212, key: null })
}

function store(world: object): Store {
  let found = STORES.get(world)
  if (found) return found
  found = {
    next: 1,
    firings: [],
    triggers: [
      trigger('deploy-failed', { kind: 'deliver', to: 'worker@acme/shop-api' }, {
        filter: [{ field: 'status', op: 'equals', value: 'failure' }, { field: 'branch', op: 'equals', value: 'main' }],
        dedupe: { field: 'run_id', days: 7 }, rate_per_hour: 10,
      }), // prettier-ignore
      trigger('new-issue', { kind: 'start', cwd: '/home/dev/code/shop-api', machine: null, role: 'triage', project: 'acme/shop-api', runtime: 'claude-code',
        message: 'A new issue was opened. Reproduce it and say what you find:\n\n{payload}' }, {
        filter: [{ field: 'labels', op: 'contains', value: 'bug' }], dedupe: { field: null, days: 7 }, rate_per_hour: 3,
      }), // prettier-ignore
      trigger('price-watch', { kind: 'deliver', to: 'research@acme/shop-api' }, {
        filter: [{ field: 'deal.price', op: 'regex', value: '^[0-9]{1,2}\\.' }], dedupe: { field: 'deal.id', days: 7 }, rate_per_hour: 6,
      }), // prettier-ignore
      trigger('nightly-backup', { kind: 'notify' }, { enabled: false, filter: [{ field: 'status', op: 'equals', value: 'failed' }] }),
    ],
  }
  seed(found, 'deploy-failed', [
    [3000, 'delivered', 'webhook', 'shop-api', null],
    [1500, 'filtered', 'webhook', null, 'status is "success", not "failure"'],
    [700, 'deduped', 'webhook', null, 'run_id 4411 was seen 2h ago'],
    [12, 'delivered', 'webhook', 'shop-api', null],
  ])
  seed(found, 'new-issue', [
    [2900, 'started', 'cli', 'triage-1', null],
    [600, 'rate_limited', 'webhook', null, 'more than 3 in an hour'],
    [120, 'failed', 'webhook', null, 'not built yet'],
  ])
  seed(found, 'price-watch', [
    [400, 'delivered', 'webhook', 'release-notes', null],
    [90, 'filtered', 'test', null, 'deal.price "120.00" does not match ^[0-9]{1,2}\\.'],
    [40, 'deduped', 'webhook', null, 'deal.id d-208 was seen 6h ago'],
  ])
  seed(found, 'nightly-backup', [
    [1980, 'notified', 'cli', null, null],
    [540, 'paused', 'cli', null, null],
  ])
  for (const t of found.triggers) note(found, t.id)
  STORES.set(world, found)
  return found
}

/** A trigger's last firing, on its row. */
function note(s: Store, id: string) {
  const last = s.firings.filter((f) => f.trigger_id === id).at(-1)
  const t = s.triggers.find((x) => x.id === id)
  if (t && last) Object.assign(t, { last_fired_at: last.at, last_outcome: last.outcome })
}

const secret = () => `demo-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`

function read(payload: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((at, k) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[k] : undefined), payload)
}

function holds(c: TriggerCondition, payload: unknown): boolean {
  const v = read(payload, c.field)
  const s = typeof v === 'string' ? v : JSON.stringify(v ?? '')
  if (c.op === 'equals') return s === c.value
  if (c.op === 'contains') return s.includes(c.value)
  try {
    return new RegExp(c.value).test(s)
  } catch {
    return false
  }
}

/** A test firing, as the daemon would take it: paused, filtered, deduped, else its action. */
function test(s: Store, t: Trigger, payload: unknown, key: string | null): Firing {
  const failed = (t.filter ?? []).find((c) => !holds(c, payload))
  const dedupeKey = t.dedupe ? (t.dedupe.field ? String(read(payload, t.dedupe.field) ?? '') : key) : null
  const seen = dedupeKey && s.firings.some((f) => f.trigger_id === t.id && f.key === dedupeKey && f.outcome !== 'filtered')
  const [outcome, target, detail]: [Firing['outcome'], string | null, string | null] = !t.enabled
    ? ['paused', null, null]
    : failed
      ? ['filtered', null, `${failed.field} ${failed.op} "${failed.value}" did not hold`]
      : seen
        ? ['deduped', null, `${t.dedupe!.field ?? 'key'} ${dedupeKey} was seen before`]
        : t.action.kind === 'deliver'
          ? ['delivered', t.action.to, null]
          : t.action.kind === 'start'
            ? ['started', `${t.name}-${s.next}`, null]
            : ['notified', null, null]
  const firing: Firing = { id: s.next++, trigger_id: t.id, at: new Date().toISOString(), via: 'test', outcome, target, detail, key: dedupeKey, bytes: 120 }
  s.firings.push(firing)
  note(s, t.id)
  return firing
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

/** `/v1/triggers…` in the demo; null when the request is not one. */
export function triggers(world: object, method: string, pathname: string, body: Record<string, unknown>): Response | null {
  const s = store(world)
  const m = /^\/v1\/triggers(?:\/([^/]+)(?:\/(firings|secret|test))?)?$/.exec(pathname)
  if (!m) return null
  const id = m[1] && decodeURIComponent(m[1])
  if (!id) {
    if (method === 'GET') return json(s.triggers)
    if (method !== 'POST') return null
    const spec = body as unknown as TriggerSpec
    if (s.triggers.some((t) => t.name === spec.name)) return json({ detail: `a trigger named ${spec.name} exists` }, 409)
    const now = new Date().toISOString()
    const made: Trigger = { ...trigger(spec.name, spec.action, {}), ...spec, id: spec.name, created_at: now, updated_at: now }
    s.triggers.push(made)
    return json({ trigger: made, secret: secret() }, 201)
  }
  const t = s.triggers.find((x) => x.id === id)
  if (!t) return json({ detail: 'no such trigger' }, 404)
  if (m[2] === 'firings' && method === 'GET') return json(s.firings.filter((f) => f.trigger_id === id).reverse())
  if (m[2] === 'secret' && method === 'POST') return json({ secret: secret() })
  if (m[2] === 'test' && method === 'POST') return json(test(s, t, body.payload, typeof body.key === 'string' ? body.key : null))
  if (m[2]) return null
  if (method === 'GET') return json(t)
  if (method === 'DELETE') {
    s.triggers = s.triggers.filter((x) => x !== t)
    return new Response(null, { status: 204 })
  }
  if (method !== 'PATCH') return null
  const { clear_dedupe, clear_rate, ...patch } = body as unknown as TriggerPatch
  for (const [k, v] of Object.entries(patch)) if (v !== null && v !== undefined) Object.assign(t, { [k]: v })
  if (clear_dedupe) t.dedupe = null
  if (clear_rate) t.rate_per_hour = null
  t.updated_at = new Date().toISOString()
  return json(t)
}
