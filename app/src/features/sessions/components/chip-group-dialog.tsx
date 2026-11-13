import { Search } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { StatusDot } from '@/components/ui/status-dot'

import { groupPicks } from '../model/chip-picks'
import { MAX_NAME, projectLabel, type ChipGroup, type ChipMembers } from '../model/chip-groups'
import type { SessionEntry } from '../model/facets'
import { Chevron } from '@/components/ui/indicators'
import { ink, look } from '@/components/ui/intents'

const TONE: Record<string, 'warn' | 'error' | 'ok'> = { needs: 'warn', error: 'error', working: 'ok' }

/** A group of projects, new (`group` undefined) or to edit: a name, then each project, ticked whole (its
 *  sessions to come too) or opened to tick single sessions of it (a fixed list). The search finds a
 *  session by its name and opens its project: where a session falls is what the owner may not know. */
export function ChipGroupDialog({
  group,
  entries,
  error,
  pending,
  onSave,
  onClose,
}: {
  group?: ChipGroup
  entries: SessionEntry[]
  error?: Error | null
  pending?: boolean
  onSave: (name: string, members: ChipMembers) => void
  onClose: () => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [picks, setPicks] = useState(() => groupPicks(entries, group))
  const [open, setOpen] = useState<string[]>([])
  const [q, setQ] = useState('')
  const shown = picks.shown(q, open)
  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent title={group ? 'Edit group' : 'New group'}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            onSave(name.trim(), picks.members())
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME}
            required
            aria-label="Group name"
            placeholder="Name"
            autoFocus={!group}
          />
          <Input
            icon={<Search />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Find a project or session"
            placeholder="Find a project or session"
          />
          <div role="group" aria-label="Projects" className="flex max-h-80 flex-col overflow-y-auto">
            {shown.map(({ project, sessions, expanded }) => {
              const state = picks.state(project)
              return (
                <div key={project} className="flex flex-col">
                  <div className={`${look.hoverRow} flex items-center gap-1`}>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={expanded ? `Hide sessions of ${projectLabel(project)}` : `Show sessions of ${projectLabel(project)}`}
                      aria-expanded={expanded}
                      disabled={!picks.sessionsOf(project).length}
                      onClick={() => setOpen((now) => (now.includes(project) ? now.filter((p) => p !== project) : [...now, project]))}
                    >
                      <Chevron open={expanded} />
                    </Button>
                    <label className={`${ink.body} flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1`}>
                      <Checkbox
                        checked={state === 'all'}
                        aria-checked={state === 'some' ? 'mixed' : state === 'all'}
                        ref={(el) => {
                          if (el) el.indeterminate = state === 'some'
                        }}
                        disabled={!picks.canTake(project)}
                        onChange={() => setPicks(picks.toggleProject(project))}
                      />
                      <span className="min-w-0 flex-1 truncate">{projectLabel(project)}</span>
                      <span className={`${ink.count} ${ink.meta}`}>{picks.sessionsOf(project).length}</span>
                    </label>
                  </div>
                  {expanded
                    ? sessions.map(({ session, daemon }) => (
                        <label key={session.id} className={`${look.hoverRow} ${ink.body} flex items-center gap-2 py-1 pr-1 pl-8`}>
                          <Checkbox
                            checked={picks.holds(project, session.id)}
                            disabled={!picks.holds(project, session.id) && !picks.canTake(session.id)}
                            onChange={() => setPicks(picks.toggleSession(project, session.id))}
                          />
                          <StatusDot tone={TONE[picks.status(session)] ?? 'idle'} label={picks.status(session)} />
                          <span className="min-w-0 flex-1 truncate">{session.name}</span>
                          <span className={`${ink.meta} max-w-24 shrink-0 truncate`}>{session.machine ?? daemon.name}</span>
                        </label>
                      ))
                    : null}
                </div>
              )
            })}
            {!shown.length ? <p className={`${ink.hint} px-2 py-3`}>Nothing matches.</p> : null}
          </div>
          {error ? <Banner tone="error">{error.message}</Banner> : null}
          <Button type="submit" disabled={pending || !name.trim() || picks.empty()}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
