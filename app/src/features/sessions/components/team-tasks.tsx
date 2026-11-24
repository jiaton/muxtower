import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ink, look } from '@/components/ui/intents'
import { Segmented } from '@/components/ui/segmented'
import { Loading } from '@/components/ui/skeleton'
import { Truncated } from '@/components/ui/truncated'
import type { TeamTask } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { useProjectActivity } from '../api/use-team'

const FIRST = 6
const WEEK = '168'
export const NO_TASKS_YET = 'No tasks yet. Sessions in this project can hand each other work.'

/** Who sent a task, by name: the session's (`names`), else the device's or the sender's own label. */
const fromOf = (t: TeamTask, names: Map<string, string>) => (t.from_id && names.get(t.from_id)) || t.from_label.split(' · ')[0]

/**
 * What a project's sessions sent each other lately, newest first, in the last 24 hours or 7 days (the
 * switch in its header): "from → to", when, the first line, "held" while it waits. The first six, then
 * "Show N more". Nothing in the window says whether there was never anything (then how a team starts).
 */
export function RecentTasks({ daemonId, project, names }: { daemonId: string; project: string; names: Map<string, string> }) {
  const [hours, setHours] = useState<'24' | typeof WEEK>('24')
  const [all, setAll] = useState(false)
  const activity = useProjectActivity(daemonId, project, Number(hours))
  const tasks = [...(activity.data?.tasks ?? [])].reverse() // the hub gives them oldest first
  const shown = all ? tasks : tasks.slice(0, FIRST)
  // Nothing in 24 h: the week (the longest window the hub answers) says whether there was ever anything.
  const week = useProjectActivity(daemonId, activity.data && !tasks.length && hours === '24' ? project : null, Number(WEEK))
  const never = hours === WEEK ? !tasks.length : Boolean(week.data && !week.data.tasks.length)
  return (
    <section aria-label="Recent tasks" className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <h4 className={`${ink.eyebrow} min-w-0 flex-1`}>Recent tasks</h4>
        <Segmented
          aria-label="How far back"
          value={hours}
          options={[
            { value: '24', label: '24 h' },
            { value: WEEK, label: '7 days' },
          ]}
          onChange={(h) => {
            setHours(h)
            setAll(false)
          }}
        />
      </div>
      {!activity.data ? (
        <Loading label="Loading tasks…" />
      ) : !tasks.length ? (
        <p className={`${ink.hint} py-2`}>
          {never ? NO_TASKS_YET : `No tasks in ${hours === WEEK ? 'the last 7 days' : 'the last 24 hours'}.`}
        </p>
      ) : (
        <ul className={`${look.rows} flex flex-col`}>
          {shown.map((t) => (
            <li key={t.id} className={cn(ink.body, 'flex min-w-0 flex-col gap-0.5 py-1.5')}>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className={`${ink.strong} min-w-0 truncate`}>{fromOf(t, names)}</span>
                <span className={ink.quiet} aria-hidden>
                  →
                </span>
                <span className="sr-only">to</span>
                <span className={`${ink.strong} min-w-0 truncate`}>{names.get(t.to_id) ?? t.to_id}</span>
                {t.status !== 'delivered' ? <span className={`${ink.noteAccent} shrink-0`}>{t.status}</span> : null}
                <time dateTime={t.at} className={cn(ink.meta, ink.count, 'ml-auto shrink-0')}>
                  {ago(t.at)}
                </time>
              </div>
              <Truncated>{t.text.split('\n')[0]}</Truncated>
            </li>
          ))}
        </ul>
      )}
      {tasks.length > shown.length ? (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll(true)}>
          Show {tasks.length - shown.length} more
        </Button>
      ) : null}
    </section>
  )
}
