import { useEffect, useMemo, useRef, useState } from 'react'
import { Segmented } from '@/components/ui/segmented'
import { diagram as look, ink } from '@/components/ui/intents'
import { Loading } from '@/components/ui/skeleton'
import { ago } from '@/lib/time'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/cn'
import { useProjectActivity } from '../api/use-team'
import { useSessionEntries } from '../hooks/use-session-entries'
import {
  NODE_H,
  NODE_W,
  buildDiagram,
  hasActivity,
  layout,
  timeline,
  type DiagramEdge,
  type DiagramEvent,
  type Placed,
} from '../model/team-diagram'

const PAD = 8
const ARC = 40 // room above the first row for the arcs over it
const LANE_H = 28
const EVENT_W = 22 // the least room a mark takes on the timeline: 50 of them scroll sideways on a phone
const STATE: Record<string, string> = { busy: 'working', idle: 'idle', needs_permission: 'asks', needs_answer: 'asks', plan_review: 'asks' }

const short = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)

/** Where the line between two boxes leaves the first: on its border, toward the other's centre. */
function border(from: Placed, to: Placed, inset = 2) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const t = Math.min(dx ? (NODE_W / 2 + inset) / Math.abs(dx) : Infinity, dy ? (NODE_H / 2 + inset) / Math.abs(dy) : Infinity)
  return { x: from.x + dx * t, y: from.y + dy * t }
}

type Chosen = { edge: DiagramEdge } | { event: DiagramEvent } | null

/** A project's team at work (`model/team-diagram.ts`): a graph of who sends work to whom on top, a
 *  timeline under it (a lane per node, each task an arrow at its time, each message a mark), the last
 *  24 hours or 7 days; a tap on an edge or a mark says what it was. */
export function TeamDiagram({ daemonId, project }: { daemonId: string; project: string | null | undefined }) {
  const [hours, setHours] = useState<'24' | '168'>('24')
  const activity = useProjectActivity(daemonId, project, Number(hours))
  const { entries } = useSessionEntries()
  const sessions = useMemo(() => entries.filter((e) => e.daemon.id === daemonId).map((e) => e.session), [entries, daemonId])
  const d = useMemo(() => (activity.data ? buildDiagram(activity.data, sessions) : null), [activity.data, sessions])
  const phone = useMediaQuery(PHONE_QUERY)
  const [chosen, setChosen] = useState<Chosen>(null)

  if (!project) return null
  const range = (
    <Segmented
      aria-label="How far back"
      value={hours}
      options={[
        { value: '24', label: '24 h' },
        { value: '168', label: '7 days' },
      ]}
      onChange={setHours}
    />
  )
  if (!d) return <Loading />
  if (!hasActivity(d))
    return (
      <section aria-label="Team activity" className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className={`${ink.eyebrow} flex-1`}>Team · {project}</h3>
          {range}
        </div>
        <p className={ink.hint}>
          Nothing sent in this team yet. A team forms from the sessions of one project: start a teammate with{' '}
          <code className={ink.code}>start_session</code> and this project, or set the project here; then they send each other work with{' '}
          <code className={ink.code}>send_task</code>, and it shows here.
        </p>
      </section>
    )

  return (
    <section aria-label="Team activity" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className={`${ink.eyebrow} min-w-0 flex-1 truncate`}>Team · {project}</h3>
        {range}
      </div>
      <Graph d={d} columns={phone ? 2 : Math.min(3, d.nodes.length)} chosen={chosen} onChoose={setChosen} />
      <Timeline d={d} hours={Number(hours)} chosen={chosen} onChoose={setChosen} />
      <Detail d={d} chosen={chosen} />
    </section>
  )
}

function Graph({
  d,
  columns,
  chosen,
  onChoose,
}: {
  d: ReturnType<typeof buildDiagram>
  columns: number
  chosen: Chosen
  onChoose: (c: Chosen) => void
}) {
  const { placed, width, height } = layout(d, Math.max(1, columns))
  const at = new Map(placed.map((p) => [p.node.id, p]))
  const pairs = new Set(d.edges.map((e) => `${e.from}→${e.to}`))
  return (
    <svg
      role="img"
      aria-label={`${d.nodes.length} in the team, ${d.edges.reduce((n, e) => n + e.count, 0)} tasks`}
      viewBox={`${-PAD} ${-PAD - ARC} ${width + 2 * PAD} ${height + 2 * PAD + ARC}`}
      className="w-full"
    >
      <defs>
        {(['head', 'headHeld'] as const).map((kind) => (
          <marker
            key={kind}
            id={`team-${kind}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" className={look[kind]} />
          </marker>
        ))}
      </defs>
      {d.edges.map((e) => {
        const a = at.get(e.from)
        const b = at.get(e.to)
        if (!a || !b) return null
        const sameRowFar = Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > NODE_W * 1.5
        // Over the row: from the top of one box to the top of the other.
        const s = sameRowFar ? { x: a.x + (b.x > a.x ? 30 : -30), y: a.y - NODE_H / 2 - 2 } : border(a, b)
        const t = sameRowFar ? { x: b.x + (a.x > b.x ? 30 : -30), y: b.y - NODE_H / 2 - 6 } : border(b, a, 6)
        // Two ways between the same two: each bends to its own side. Along a row past a box between them:
        // an arc over the row, clear of it.
        const sameRow = Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > NODE_W * 1.5
        const bend = sameRow ? (a.x < b.x ? -1 : 1) * (NODE_H + 10) : pairs.has(`${e.to}→${e.from}`) ? 22 : 0
        const mx = (s.x + t.x) / 2
        const my = (s.y + t.y) / 2
        const len = Math.hypot(t.x - s.x, t.y - s.y) || 1
        const cx = mx + (-(t.y - s.y) / len) * bend
        const cy = my + ((t.x - s.x) / len) * bend
        const path = `M${s.x} ${s.y}Q${cx} ${cy} ${t.x} ${t.y}`
        const isChosen = chosen && 'edge' in chosen && chosen.edge === e
        const held = e.held > 0
        const labelX = (s.x + 2 * cx + t.x) / 4
        const labelY = (s.y + 2 * cy + t.y) / 4
        return (
          <g key={`${e.from}→${e.to}`}>
            <path
              d={path}
              className={isChosen ? look.edgeChosen : held ? look.edgeHeld : look.edge}
              strokeWidth={Math.min(4, 1 + Math.log2(e.count))}
              markerEnd={`url(#team-${held ? 'headHeld' : 'head'})`}
            />
            <path d={path} className={look.hit} strokeWidth={16} onClick={() => onChoose({ edge: e })}>
              <title>{`${e.count} task${e.count === 1 ? '' : 's'}: ${e.latest.text}`}</title>
            </path>
            <g onClick={() => onChoose({ edge: e })} className="cursor-pointer">
              <circle cx={labelX} cy={labelY} r={10} className={held ? look.badgeHeld : look.badge} />
              <text x={labelX} y={labelY} dy="0.35em" textAnchor="middle" className={look.count}>
                {e.count}
              </text>
            </g>
          </g>
        )
      })}
      {placed.map(({ node, x, y }) => (
        <g key={node.id}>
          <rect
            x={x - NODE_W / 2}
            y={y - NODE_H / 2}
            width={NODE_W}
            height={NODE_H}
            rx={8}
            strokeWidth={node.state === 'busy' ? 2 : 1}
            className={node.external ? look.nodeOutside : node.state === 'busy' ? look.nodeBusy : look.node}
          />
          <text x={x} y={y - 4} textAnchor="middle" className={look.name}>
            {short(node.label, 20)}
            <title>{node.label}</title>
          </text>
          <text x={x} y={y + 13} textAnchor="middle" className={look.meta}>
            {short([node.state ? (STATE[node.state] ?? node.state) : null, node.device].filter(Boolean).join(' · ') || ' ', 24)}
          </text>
        </g>
      ))}
    </svg>
  )
}

function Timeline({
  d,
  hours,
  chosen,
  onChoose,
}: {
  d: ReturnType<typeof buildDiagram>
  hours: number
  chosen: Chosen
  onChoose: (c: Chosen) => void
}) {
  const { placed } = layout(d, 1)
  const lanes = placed.map((p) => p.node)
  const lane = new Map(lanes.map((n, i) => [n.id, i]))
  const { start, end } = timeline(d, hours)
  const events = d.events.filter((e) => Date.parse(e.at) >= start)
  const width = Math.max(320, events.length * EVENT_W + 40)
  const x = (at: string) => 16 + ((Date.parse(at) - start) / Math.max(1, end - start)) * (width - 32)
  const y = (id: string) => (lane.get(id) ?? 0) * LANE_H + LANE_H / 2
  const height = lanes.length * LANE_H
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth // now, at the right
  }, [width])

  return (
    <div className="flex min-w-0">
      <ul className="flex shrink-0 flex-col pr-2" aria-hidden>
        {lanes.map((n) => (
          <li key={n.id} className={cn(ink.meta, 'flex max-w-24 items-center truncate')} style={{ height: LANE_H }}>
            {n.label}
          </li>
        ))}
      </ul>
      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
        <svg role="img" aria-label={`${events.length} sent in this time`} width={width} height={height}>
          {lanes.map((n, i) => (
            <line key={n.id} x1={0} x2={width} y1={i * LANE_H + LANE_H / 2} y2={i * LANE_H + LANE_H / 2} className={look.lane} />
          ))}
          <line x1={width - 16} x2={width - 16} y1={0} y2={height} className={look.now} strokeDasharray="2 3" />
          {events.map((e) => {
            const ex = x(e.at)
            const y1 = y(e.from)
            const y2 = y(e.to)
            const isChosen = chosen && 'event' in chosen && chosen.event === e
            const held = e.kind === 'task' && e.status !== 'delivered'
            const down = y2 >= y1
            return (
              <g key={e.id} className="cursor-pointer" onClick={() => onChoose({ event: e })}>
                <rect x={ex - EVENT_W / 2} y={0} width={EVENT_W} height={height} className={look.hit} />
                {e.kind === 'task' ? (
                  <line
                    x1={ex}
                    x2={ex}
                    y1={y1}
                    y2={y2 + (down ? -6 : 6)}
                    strokeWidth={isChosen ? 3 : 1.5}
                    className={held ? look.edgeHeld : isChosen ? look.edgeChosen : look.edge}
                    markerEnd={`url(#team-${held ? 'headHeld' : 'head'})`}
                  />
                ) : (
                  <line x1={ex} x2={ex} y1={y1} y2={y2} strokeDasharray="1 3" strokeWidth={isChosen ? 3 : 1.5} className={look.message} />
                )}
                <circle cx={ex} cy={y1} r={3} className={held ? look.headHeld : look.head} />
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function Detail({ d, chosen }: { d: ReturnType<typeof buildDiagram>; chosen: Chosen }) {
  const name = (id: string) => d.nodes.find((n) => n.id === id)?.label ?? id
  if (!chosen) return <p className={ink.meta}>Tap an arrow or a mark for what was sent.</p>
  if ('edge' in chosen) {
    const e = chosen.edge
    return (
      <div className={cn(ink.body, 'flex flex-col gap-1')} aria-live="polite">
        <p className={ink.strong}>
          {name(e.from)} → {name(e.to)} · {e.count} task{e.count === 1 ? '' : 's'}
          {e.held ? ` · ${e.held} waiting` : ''}
        </p>
        <p className={ink.meta}>
          Latest {ago(e.latest.at)} · {e.latest.status}
        </p>
        <p className="line-clamp-3 whitespace-pre-wrap">{e.latest.text}</p>
      </div>
    )
  }
  const e = chosen.event
  return (
    <div className={cn(ink.body, 'flex flex-col gap-1')} aria-live="polite">
      <p className={ink.strong}>
        {name(e.from)} → {name(e.to)} · {e.kind === 'task' ? 'task' : 'message'}
      </p>
      <p className={ink.meta}>
        {ago(e.at)}
        {e.status ? ` · ${e.status}` : ''}
      </p>
      {e.text ? (
        <p className="max-h-40 overflow-y-auto whitespace-pre-wrap">{e.text}</p>
      ) : (
        <p className={ink.meta}>Typed into the session (its text is not kept).</p>
      )}
    </div>
  )
}
