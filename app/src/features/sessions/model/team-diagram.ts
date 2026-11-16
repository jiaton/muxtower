/**
 * A project's team at work, as a diagram (`TeamDiagram`): who is on it (a node per member, by role), who
 * sends work to whom (an edge per direction, weighted by its tasks), what waits now (held tasks), and when
 * (a timeline, a lane per node). Built from the project's activity (GET /v1/projects/{project}/activity)
 * and the sessions the app knows. Senders and receivers outside the team are external nodes, kept apart;
 * a device that sent a task is a node too ("you"). Messages (send_message) are on the timeline only.
 */
import type { AgentState, Session, TeamActivity } from '@/lib/api/types'
import { deviceOf } from './facets'

export interface DiagramNode {
  id: string // a session id, or `device:<label>`
  label: string // its role (or name), "you", or for an external one its project and role
  device: string | null
  state: AgentState | null
  external: boolean
  sessions: string[] // the sessions it stands for (members sharing a role are one node)
}

export interface DiagramEdge {
  from: string
  to: string
  count: number
  held: number // waiting to be delivered, or not deliverable
  latest: { at: string; text: string; status: string }
}

export interface DiagramEvent {
  at: string
  from: string
  to: string
  kind: 'task' | 'message'
  status?: string
  text?: string
  id: string
}

export interface Diagram {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  events: DiagramEvent[]
}

const DEVICE = 'device:'

/** The diagram of a project's activity; `sessions`: every session the app knows (names, roles, states). */
export function buildDiagram(activity: TeamActivity, sessions: Session[]): Diagram {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const members = new Set(activity.members)
  const nodes = new Map<string, DiagramNode>()
  const nodeOf = new Map<string, string>() // session id or device label → node id

  const place = (sessionId: string | null | undefined, fallback: string): string => {
    if (!sessionId) {
      const label = fallback.split(' · ')[0]?.replace(/^device /, '') || 'you'
      const id = `${DEVICE}${label}`
      if (!nodes.has(id)) nodes.set(id, { id, label: 'you', device: label, state: null, external: false, sessions: [] })
      return id
    }
    const known = nodeOf.get(sessionId)
    if (known) return known
    const session = byId.get(sessionId)
    const external = !members.has(sessionId)
    const role = session?.team_role?.split(' — ')[0]?.trim() || session?.name || sessionId
    const label = external ? `${session?.project ?? 'other'} · ${role}` : role
    // Members sharing a role are one node (two workers); an external one is always its own.
    const id = external ? `ext:${sessionId}` : `role:${label}`
    const node = nodes.get(id) ?? {
      id,
      label,
      device: session ? deviceOf(session) : null,
      state: session?.state ?? null,
      external,
      sessions: [],
    }
    node.sessions.push(sessionId)
    if (session?.state === 'busy') node.state = 'busy'
    nodes.set(id, node)
    nodeOf.set(sessionId, id)
    return id
  }

  for (const id of activity.members) place(id, id)
  const edges = new Map<string, DiagramEdge>()
  const events: DiagramEvent[] = []
  for (const task of activity.tasks) {
    const from = place(task.from_id, task.from_label)
    const to = place(task.to_id, task.to_id)
    const key = `${from}→${to}`
    const edge = edges.get(key) ?? { from, to, count: 0, held: 0, latest: { at: task.at, text: task.text, status: task.status } }
    edge.count++
    if (task.status !== 'delivered') edge.held++
    if (task.at >= edge.latest.at) edge.latest = { at: task.at, text: task.text, status: task.status }
    edges.set(key, edge)
    events.push({ at: task.at, from, to, kind: 'task', status: task.status, text: task.text, id: `t${task.id}` })
  }
  for (const [i, m] of activity.messages.entries()) {
    events.push({ at: m.at, from: place(m.from_id, m.from_label), to: place(m.to_id, m.to_id), kind: 'message', id: `m${i}` })
  }
  events.sort((a, b) => a.at.localeCompare(b.at))
  return { nodes: [...nodes.values()], edges: [...edges.values()], events }
}

/** Whether there is anything to draw: two nodes or more, and something sent. */
export const hasActivity = (d: Diagram) => d.nodes.length > 1 && d.events.length > 0

/** Two nodes that sent each other work: one line between them, its counts each way. */
export interface Pair {
  a: string
  b: string
  ab: number // tasks a → b
  ba: number
  held: number // of either way, not delivered
  total: number
}

/** Each pair of nodes that sent each other tasks, the busiest first. */
export function pairsOf(d: Diagram): Pair[] {
  const pairs = new Map<string, Pair>()
  for (const e of d.edges) {
    const [a, b] = e.from < e.to ? [e.from, e.to] : [e.to, e.from]
    const pair = pairs.get(`${a} ${b}`) ?? { a, b, ab: 0, ba: 0, held: 0, total: 0 }
    if (e.from === a) pair.ab += e.count
    else pair.ba += e.count
    pair.held += e.held
    pair.total += e.count
    pairs.set(`${a} ${b}`, pair)
  }
  return [...pairs.values()].sort((x, y) => y.total - x.total)
}

/** Members that sent or were sent no task in the range: said in a line, not drawn. */
export const idleNodes = (d: Diagram, pairs = pairsOf(d)) =>
  d.nodes.filter((n) => !n.external && !pairs.some((p) => p.a === n.id || p.b === n.id))

/**
 * The role in the middle of the view: the one it was opened from (a session's: `from`); else the one the
 * owner works with most (typing into it, answering it, sending it tasks from a device, `owner`); else the
 * one with the most traffic. Only a role that sent or got something in the range.
 */
export function centreOf(d: Diagram, owner: Record<string, number>, from?: string, pairs = pairsOf(d)): string | null {
  const busy = new Set(pairs.flatMap((p) => [p.a, p.b]))
  const candidates = d.nodes.filter((n) => busy.has(n.id) && !n.external && !n.id.startsWith('device:'))
  if (!candidates.length) return null
  if (from) {
    const own = candidates.find((n) => n.sessions.includes(from))
    if (own) return own.id
  }
  const touched = (id: string) =>
    (d.nodes.find((n) => n.id === id)?.sessions ?? []).reduce((k, sid) => k + (owner[sid] ?? 0), 0) +
    d.edges.filter((e) => e.to === id && e.from.startsWith('device:')).reduce((k, e) => k + e.count, 0)
  const traffic = (id: string) => pairs.filter((p) => p.a === id || p.b === id).reduce((k, p) => k + p.total, 0)
  return [...candidates].sort(
    (x, y) => touched(y.id) - touched(x.id) || traffic(y.id) - traffic(x.id) || x.label.localeCompare(y.label),
  )[0]!.id
}

/** A pair seen from one of its ends: what that end sent the other and got from it. */
export interface Spoke {
  pair: Pair
  other: string
  sent: number
  got: number
}

/** The centre's pairs, as spokes (the busiest first), and the pairs it is not in ("Also"). */
export function spokesOf(pairs: Pair[], centre: string): { spokes: Spoke[]; also: Pair[] } {
  const spokes = pairs
    .filter((p) => p.a === centre || p.b === centre)
    .map((p) => (p.a === centre ? { pair: p, other: p.b, sent: p.ab, got: p.ba } : { pair: p, other: p.a, sent: p.ba, got: p.ab }))
  return { spokes, also: pairs.filter((p) => p.a !== centre && p.b !== centre) }
}

/** "sent 13 · got 18", from the centre's side; a side with nothing left out. */
export const spokeWords = (s: Spoke) => [s.sent ? `sent ${s.sent}` : null, s.got ? `got ${s.got}` : null].filter(Boolean).join(' · ')

/** The feed: what was sent, newest first, grouped by day; narrowed to a node or a pair. */
export function feed(d: Diagram, filter: { node?: string; pair?: [string, string] } | null): { day: string; events: DiagramEvent[] }[] {
  const shown = d.events
    .filter((e) => {
      if (!filter) return true
      if (filter.node) return e.from === filter.node || e.to === filter.node
      const [a, b] = filter.pair!
      return (e.from === a && e.to === b) || (e.from === b && e.to === a)
    })
    .reverse()
  const days: { day: string; events: DiagramEvent[] }[] = []
  for (const e of shown) {
    const day = new Date(e.at).toDateString()
    const last = days.at(-1)
    if (last?.day === day) last.events.push(e)
    else days.push({ day, events: [e] })
  }
  return days
}
