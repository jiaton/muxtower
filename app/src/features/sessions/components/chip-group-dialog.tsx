import { ChevronRight, Search } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { StatusDot } from '@/components/ui/status-dot'
import { cn } from '@/lib/cn'
import { groupPicks } from '../model/chip-picks'
import { MAX_NAME, projectLabel, type ChipGroup, type ChipMembers } from '../model/chip-groups'
import type { SessionEntry } from '../model/facets'

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
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Find a project or session"
              placeholder="Find a project or session"
              className="pl-8"
            />
          </div>
          <div role="group" aria-label="Projects" className="flex max-h-80 flex-col overflow-y-auto">
            {shown.map(({ project, sessions, expanded }) => {
              const state = picks.state(project)
              return (
                <div key={project} className="flex flex-col">
                  <div className="flex items-center gap-1 rounded-md hover:bg-surface-muted">
                    <button
                      type="button"
                      aria-label={expanded ? `Hide sessions of ${projectLabel(project)}` : `Show sessions of ${projectLabel(project)}`}
                      aria-expanded={expanded}
                      disabled={!picks.sessionsOf(project).length}
                      onClick={() => setOpen((now) => (now.includes(project) ? now.filter((p) => p !== project) : [...now, project]))}
                      className="flex size-7 shrink-0 items-center justify-center rounded text-fg-muted hover:text-fg disabled:opacity-30"
                    >
                      <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} aria-hidden />
                    </button>
                    <label className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-sm">
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
                      <span className="text-xs text-fg-muted tabular-nums">{picks.sessionsOf(project).length}</span>
                    </label>
                  </div>
                  {expanded
                    ? sessions.map(({ session, daemon }) => (
                        <label
                          key={session.id}
                          className="flex items-center gap-2 rounded-md py-1 pr-1 pl-9 text-sm hover:bg-surface-muted"
                        >
                          <Checkbox
                            checked={picks.holds(project, session.id)}
                            disabled={!picks.holds(project, session.id) && !picks.canTake(session.id)}
                            onChange={() => setPicks(picks.toggleSession(project, session.id))}
                          />
                          <StatusDot tone={TONE[picks.status(session)] ?? 'idle'} label={picks.status(session)} />
                          <span className="min-w-0 flex-1 truncate">{session.name}</span>
                          <span className="max-w-24 shrink-0 truncate text-xs text-fg-muted">{session.machine ?? daemon.name}</span>
                        </label>
                      ))
                    : null}
                </div>
              )
            })}
            {!shown.length ? <p className="px-2 py-3 text-sm text-fg-muted">Nothing matches.</p> : null}
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
