import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SuggestInput } from '@/components/ui/suggest-input'
import type { Session, TeamTask } from '@/lib/api/types'
import { ago } from '@/lib/time'
import { useSessionTasks, useUpdateTeam } from '../api/use-team'
import { useSessionEntries } from '../hooks/use-session-entries'

const count = (n: number) => `${n} session${n === 1 ? '' : 's'}`

/** Counts of the values sessions have (roles, projects), for suggestions. */
function tally(values: (string | null | undefined)[]) {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].map(([value, n]) => ({ value, hint: count(n) }))
}

function TaskLine({ task, sessionId }: { task: TeamTask; sessionId: string }) {
  const sent = task.from_id === sessionId
  const Icon = sent ? ArrowUpRight : ArrowDownLeft
  return (
    <li className="flex gap-2 py-1.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-label={sent ? 'Sent' : 'Received'} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2">{task.text}</p>
        <p className="text-xs text-fg-muted">
          {sent ? `to ${task.to_id}` : `from ${task.from_label.split(' · ')[0]}`} · {ago(task.at)} · {task.status}
        </p>
      </div>
    </li>
  )
}

/** What a session is for in its team (a role: free text, the agents' to read), the project it works on
 *  with others, and the tasks teammates sent it or it sent them. Agents set the same through muxtower's
 *  MCP tools; this is the owner's say. */
export function TeamDialog({ daemonId, session, onClose }: { daemonId: string; session: Session; onClose: () => void }) {
  const update = useUpdateTeam(daemonId, session.id)
  const tasks = useSessionTasks(daemonId, session.id)
  const { entries } = useSessionEntries()
  const sessions = entries.filter((e) => e.daemon.id === daemonId).map((e) => e.session)
  const [role, setRole] = useState(session.team_role ?? '')
  const [note, setNote] = useState(session.team_note ?? '')
  const [project, setProject] = useState(session.project ?? '')
  const save = () =>
    update.mutate(
      { role: role.trim(), note: note.trim(), rename_project: false, ...(project.trim() ? { project: project.trim() } : {}) },
      { onSuccess: onClose },
    )

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        title={`${session.name} in its team`}
        description="Sessions of a project find each other by role and hand each other work."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Role
            <SuggestInput
              placeholder="worker"
              value={role}
              onValueChange={setRole}
              maxLength={60}
              suggestions={tally(sessions.map((s) => s.team_role))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Note <span className="font-normal text-fg-muted">optional</span>
            <Input
              placeholder="Implements what research agreed on"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Project
            <SuggestInput
              placeholder="owner/repo"
              value={project}
              onValueChange={setProject}
              maxLength={120}
              suggestions={tally(sessions.map((s) => s.project))}
            />
          </label>
          {update.error ? <Banner tone="error">{update.error.message}</Banner> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={update.isPending}>
              Save
            </Button>
          </div>
        </form>
        <section aria-label="Tasks" className="mt-2 border-t border-border pt-3">
          <h3 className="text-xs font-medium tracking-wide text-fg-muted uppercase">Tasks</h3>
          {tasks.data?.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {tasks.data.map((task) => (
                <TaskLine key={task.id} task={task} sessionId={session.id} />
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-fg-muted">{tasks.isLoading ? 'Loading…' : 'No tasks sent or received yet.'}</p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  )
}
