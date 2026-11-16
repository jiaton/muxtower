import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { ink, look, rail, roleCard } from '@/components/ui/intents'
import { Loading } from '@/components/ui/skeleton'
import { Truncated } from '@/components/ui/truncated'
import type { TeamActivity } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import { useProjectActivity } from '../api/use-team'
import { useSessionEntries } from '../hooks/use-session-entries'
import {
  buildDiagram,
  centreOf,
  feed,
  hasActivity,
  idleNodes,
  pairsOf,
  spokeWords,
  spokesOf,
  type Diagram,
  type DiagramEvent,
  type DiagramNode,
  type Pair,
} from '../model/team-diagram'

const FEED_SHOWN = 20
const STATE: Record<string, string> = { busy: 'working', idle: 'idle', needs_permission: 'asks', needs_answer: 'asks', plan_review: 'asks' }

export type Filter = { node: string } | { pair: [string, string] } | null

const time = (at: string) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const metaOf = (n: DiagramNode) => [n.state ? (STATE[n.state] ?? n.state) : null, n.device].filter(Boolean).join(' · ')

/** A project's team at work (`model/team-diagram.ts`), from its activity in the last 24 hours or 7 days.
 *  `from`: the session it was opened from (its role is the centre); else the role the owner works with most. */
export function TeamDiagram({ daemonId, project, from }: { daemonId: string; project: string | null | undefined; from?: string }) {
  const [hours, setHours] = useState<'24' | '168'>('24')
  const activity = useProjectActivity(daemonId, project, Number(hours))
  const { entries } = useSessionEntries()
  const sessions = useMemo(() => entries.filter((e) => e.daemon.id === daemonId).map((e) => e.session), [entries, daemonId])
  const d = useMemo(() => (activity.data ? buildDiagram(activity.data, sessions) : null), [activity.data, sessions])
  if (!project) return null
  if (!d || !activity.data) return <Loading />
  return <TeamActivityView d={d} activity={activity.data} project={project} from={from} hours={hours} onHours={setHours} />
}

/**
 * The centre role on top, the roles it works with each a card on a rail under it, what went each way
 * beside it ("sent 13 · got 18", from the centre's side) in a column of one width, so the cards line up;
 * the pairs the centre is not in after it ("Also"); the roles that sent and got nothing in a line; then
 * what was sent, newest first, grouped by day. A tap on a card makes it the centre; on a count, narrows
 * the list to that pair; on the centre, to that role.
 */
export function TeamActivityView({
  d,
  activity,
  project,
  from,
  hours,
  onHours,
}: {
  d: Diagram
  activity: TeamActivity
  project: string
  from?: string
  hours: '24' | '168'
  onHours: (h: '24' | '168') => void
}) {
  const pairs = useMemo(() => pairsOf(d), [d])
  const [chosen, setChosen] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>(null)
  const header = (
    <div className="flex items-center gap-2">
      <h3 className={`${ink.eyebrow} min-w-0 flex-1 truncate`}>Team · {project}</h3>
      <Segmented
        aria-label="How far back"
        value={hours}
        options={[
          { value: '24', label: '24 h' },
          { value: '168', label: '7 days' },
        ]}
        onChange={onHours}
      />
    </div>
  )
  const centre = chosen && pairs.some((p) => p.a === chosen || p.b === chosen) ? chosen : centreOf(d, activity.owner ?? {}, from, pairs)
  if (!hasActivity(d) || !centre)
    return (
      <section aria-label="Team activity" className="flex flex-col gap-2">
        {header}
        <p className={ink.hint}>
          Nothing sent in this team yet. A team forms from the sessions of one project: start a teammate with{' '}
          <code className={ink.code}>start_session</code> and this project, or set the project here; then they send each other work with{' '}
          <code className={ink.code}>send_task</code>, and it shows here.
        </p>
      </section>
    )
  const node = (id: string) => d.nodes.find((n) => n.id === id)!
  const name = (id: string) => d.nodes.find((n) => n.id === id)?.label ?? id
  const { spokes, also } = spokesOf(pairs, centre)
  const idle = idleNodes(d, pairs)
  const width = Math.max(...spokes.map((s) => spokeWords(s).length), 6) + 2 // the widest count, in characters
  const directions = (p: Pair) =>
    [p.ab ? `${name(p.a)} → ${name(p.b)} ${p.ab}` : null, p.ba ? `${name(p.b)} → ${name(p.a)} ${p.ba}` : null].filter(Boolean).join(', ')
  const isPair = (p: Pair) => filter && 'pair' in filter && filter.pair[0] === p.a && filter.pair[1] === p.b
  const pickPair = (p: Pair) => setFilter(isPair(p) ? null : { pair: [p.a, p.b] })

  return (
    <section aria-label="Team activity" className="flex min-w-0 flex-col gap-3">
      {header}
      <Button
        variant="plain"
        aria-pressed={Boolean(filter && 'node' in filter && filter.node === centre)}
        onClick={() => setFilter(filter && 'node' in filter && filter.node === centre ? null : { node: centre })}
        className={cn(
          roleCard({ centre: true, busy: node(centre).state === 'busy' }),
          'flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left',
        )}
      >
        <span className={`${ink.strong} min-w-0 flex-1 truncate`}>{node(centre).label}</span>
        <span className={`${ink.meta} shrink-0`}>{metaOf(node(centre))}</span>
      </Button>
      <ul className={`${rail.line} ml-4 flex flex-col`} aria-label={`Who ${node(centre).label} works with`}>
        {spokes.map((s) => {
          const other = node(s.other)
          return (
            <li key={s.other} className="flex min-w-0 items-center gap-2 py-1">
              <span className={`${rail.stub} w-3 shrink-0`} aria-hidden />
              <Button
                variant="plain"
                title={directions(s.pair)}
                aria-pressed={Boolean(isPair(s.pair))}
                onClick={() => pickPair(s.pair)}
                className={cn(look.pill, s.pair.held ? ink.noteAccent : ink.meta, ink.count, 'shrink-0 justify-end px-2 py-0.5 text-right')}
                style={{ width: `${width}ch` }}
              >
                {spokeWords(s)}
              </Button>
              <Button
                variant="plain"
                onClick={() => setChosen(s.other)}
                aria-label={`Put ${other.label} in the middle`}
                className={cn(
                  roleCard({ busy: other.state === 'busy', outside: other.external }),
                  'flex min-w-0 flex-1 flex-col items-start px-3 py-1 text-left',
                )}
              >
                {/* Its name the card's whole width, what it is doing under it: a phone has room for both. */}
                <span className={`${ink.strong} w-full truncate`}>{other.label}</span>
                <span className={`${ink.meta} w-full truncate`}>{metaOf(other)}</span>
              </Button>
            </li>
          )
        })}
      </ul>
      {also.length ? (
        <div className="flex flex-col gap-1">
          <h4 className={ink.eyebrow}>Also</h4>
          {also.map((p) => (
            <Button
              key={`${p.a} ${p.b}`}
              variant="plain"
              title={directions(p)}
              aria-pressed={Boolean(isPair(p))}
              onClick={() => pickPair(p)}
              className={cn(ink.body, 'flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-left')}
            >
              {[p.ab ? [p.a, p.b, p.ab] : null, p.ba ? [p.b, p.a, p.ba] : null]
                .filter((x): x is [string, string, number] => x !== null)
                .map(([a, b, n], i) => (
                  <span key={i} className="inline-flex min-w-0 items-center gap-1">
                    {i ? <span className={ink.quiet}>·</span> : null}
                    <span className={`${look.tag} min-w-0 truncate`}>{name(a)}</span>
                    <span className={ink.quiet}>→</span>
                    <span className={`${look.tag} min-w-0 truncate`}>{name(b)}</span>
                    <span className={cn(p.held ? ink.noteAccent : ink.meta, ink.count)}>{n}</span>
                  </span>
                ))}
            </Button>
          ))}
        </div>
      ) : null}
      {idle.length ? (
        <p className={ink.meta}>
          No tasks in {hours === '24' ? '24 h' : '7 days'}: {idle.map((n) => (n.device ? `${n.label} (${n.device})` : n.label)).join(' · ')}
        </p>
      ) : null}
      <Feed d={d} name={name} filter={filter} onClear={() => setFilter(null)} />
    </section>
  )
}

export function Feed({ d, name, filter, onClear }: { d: Diagram; name: (id: string) => string; filter: Filter; onClear: () => void }) {
  const [all, setAll] = useState(false)
  const days = feed(d, filter ? ('node' in filter ? { node: filter.node } : { pair: filter.pair }) : null)
  const count = days.reduce((n, day) => n + day.events.length, 0)
  let left = all ? Infinity : FEED_SHOWN
  return (
    <section aria-label="What was sent" className="flex flex-col gap-2">
      {filter ? (
        <Button
          variant="plain"
          onClick={onClear}
          className={`${look.pill} ${ink.meta} inline-flex items-center gap-1 self-start py-1 pr-2 pl-3`}
        >
          <span>Only {'node' in filter ? name(filter.node) : `${name(filter.pair[0])} ⇄ ${name(filter.pair[1])}`}</span>
          <X className={`${ink.quiet} size-3.5`} aria-label="Show all" />
        </Button>
      ) : null}
      {days.map((day) => {
        if (left <= 0) return null
        const events = day.events.slice(0, left)
        left -= events.length
        return (
          <div key={day.day} className="flex flex-col">
            <h4 className={ink.eyebrow}>{day.day === new Date().toDateString() ? 'Today' : day.day}</h4>
            <ul className={`${look.rows} flex flex-col`}>
              {events.map((e) => (
                <FeedRow key={e.id} event={e} name={name} />
              ))}
            </ul>
          </div>
        )
      })}
      {count > FEED_SHOWN && !all ? (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll(true)}>
          Show {count - FEED_SHOWN} more
        </Button>
      ) : null}
    </section>
  )
}

function FeedRow({ event: e, name }: { event: DiagramEvent; name: (id: string) => string }) {
  const held = e.kind === 'task' && e.status !== 'delivered'
  return (
    <li className={cn(ink.body, 'flex flex-col gap-0.5 py-1.5')}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={cn(ink.meta, ink.count, 'shrink-0')}>{time(e.at)}</span>
        <span className={`${look.tag} min-w-0 truncate`}>{name(e.from)}</span>
        <span className={ink.quiet}>→</span>
        <span className={`${look.tag} min-w-0 truncate`}>{name(e.to)}</span>
        {held ? <span className={cn(ink.noteAccent, 'ml-auto shrink-0')}>{e.status}</span> : null}
      </div>
      {e.kind === 'task' ? (
        <Truncated>{(e.text ?? '').split('\n')[0]}</Truncated>
      ) : (
        <span className={ink.meta}>typed in (text not kept)</span>
      )}
    </li>
  )
}
