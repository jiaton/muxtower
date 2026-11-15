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

export interface Placed {
  node: DiagramNode
  x: number // its centre
  y: number
}

export const NODE_W = 150
export const NODE_H = 46
const GAP_X = 40
const GAP_Y = 56

/** Where each node goes: senders above receivers (most sent less received first), in rows of `columns`;
 *  external nodes last, in their own row(s). Returns the boxes' centres and the drawing's size. */
export function layout(d: Diagram, columns: number): { placed: Placed[]; width: number; height: number } {
  const out = new Map<string, number>()
  const inn = new Map<string, number>()
  for (const e of d.edges) {
    out.set(e.from, (out.get(e.from) ?? 0) + e.count)
    inn.set(e.to, (inn.get(e.to) ?? 0) + e.count)
  }
  const rank = (n: DiagramNode) => (out.get(n.id) ?? 0) - (inn.get(n.id) ?? 0)
  const order = (list: DiagramNode[]) => [...list].sort((a, b) => rank(b) - rank(a) || a.label.localeCompare(b.label))
  const rows: DiagramNode[][] = []
  for (const group of [order(d.nodes.filter((n) => !n.external)), order(d.nodes.filter((n) => n.external))])
    for (let i = 0; i < group.length; i += columns) rows.push(group.slice(i, i + columns))
  const width = columns * NODE_W + (columns - 1) * GAP_X
  const placed = rows.flatMap((row, r) => {
    const rowWidth = row.length * NODE_W + (row.length - 1) * GAP_X
    const left = (width - rowWidth) / 2
    return row.map((node, c) => ({ node, x: left + c * (NODE_W + GAP_X) + NODE_W / 2, y: r * (NODE_H + GAP_Y) + NODE_H / 2 }))
  })
  return { placed, width, height: rows.length * NODE_H + Math.max(0, rows.length - 1) * GAP_Y }
}

/** The timeline's span: the last `hours`, or from the first event when that is later. */
export function timeline(d: Diagram, hours: number, now = Date.now()): { start: number; end: number } {
  const start = now - hours * 3_600_000
  const first = d.events.length ? Date.parse(d.events[0]!.at) : now
  return { start: Math.max(start, first - 60_000), end: now }
}
