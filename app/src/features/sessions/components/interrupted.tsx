import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import type { Session } from '@/lib/api/types'
import { daemonKey } from '@/lib/query'
import { useRecoverSessions } from '../api/use-recovery'
import { deviceOf, folderOf, placeOf, type SessionEntry } from '../model/facets'
import { textRole } from '@/components/ui/styles'

/** The sessions a restart interrupted, by machine (its daemon's name where the session names none). */
export function byMachine(entries: SessionEntry[]): { machine: string; entries: SessionEntry[] }[] {
  const groups = new Map<string, SessionEntry[]>()
  for (const entry of entries) {
    const machine = deviceOf(entry.session) ?? entry.daemon.name
    groups.set(machine, [...(groups.get(machine) ?? []), entry])
  }
  return [...groups].map(([machine, list]) => ({ machine, entries: list }))
}

/** Above the list while sessions wait to be started again after a restart: opens the dialog that does
 *  it. Nothing shows when none wait. */
export function InterruptedBanner({ entries }: { entries: SessionEntry[] }) {
  const interrupted = entries.filter((e) => placeOf(e.session) === 'interrupted')
  const [open, setOpen] = useState(false)
  if (!interrupted.length) return null
  const n = interrupted.length
  return (
    <div className="p-3 pb-0">
      <Banner tone="warning">
        <RotateCcw />
        <span className="min-w-0 flex-1">
          {n} session{n === 1 ? ' was' : 's were'} interrupted by a restart.{' '}
          <button type="button" className="font-medium underline" onClick={() => setOpen(true)}>
            Start again…
          </button>
        </span>
      </Banner>
      {open ? <RecoveryDialog entries={interrupted} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

/** Every interrupted session, by machine, all ticked: those left ticked are started again (each in its
 *  folder with the options it was started with, resuming its conversation; nothing is sent to it), the
 *  others wait under Interrupted, to start later or delete. */
export function RecoveryDialog({ entries, onClose }: { entries: SessionEntry[]; onClose: () => void }) {
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const recover = useRecoverEntries()
  const ticked = entries.filter((e) => !unticked.has(e.key))
  const toggle = (key: string) =>
    setUnticked((was) => {
      const next = new Set(was)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        title="Start interrupted sessions again"
        description="Each resumes its conversation in its folder, with the options it was started with. Nothing is sent to it, so it waits for you."
      >
        <div className="flex flex-col gap-3">
          {byMachine(entries).map(({ machine, entries: list }) => (
            <section key={machine} aria-label={machine} className="flex flex-col gap-1">
              <h3 className={textRole.eyebrow}>{machine}</h3>
              {list.map(({ key, session }) => (
                <label key={key} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-muted">
                  <Checkbox checked={!unticked.has(key)} onChange={() => toggle(key)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{session.name}</span>
                    <span className={`${textRole.meta} block truncate`}>
                      {[session.team_role, folderOf(session), session.source === 'adopted' ? 'not started by muxtower' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </label>
              ))}
            </section>
          ))}
        </div>
        {recover.error ? <Banner tone="error">{recover.error.message}</Banner> : null}
        <div className="flex items-center justify-end gap-2">
          <Link to="/" search={{ view: 'interrupted' }} className={`${textRole.hint} mr-auto underline`} onClick={onClose}>
            Show them
          </Link>
          <Button variant="ghost" onClick={onClose}>
            Later
          </Button>
          <Button disabled={!ticked.length || recover.isPending} onClick={() => recover.mutate(ticked, { onSuccess: onClose })}>
            <RotateCcw /> Start {ticked.length}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** One request per daemon, with the ids it lists (a hub starts its nodes' through them). */
function useRecoverEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (entries: SessionEntry[]) => {
      const perDaemon = new Map<string, SessionEntry[]>()
      for (const e of entries) perDaemon.set(e.daemon.id, [...(perDaemon.get(e.daemon.id) ?? []), e])
      await Promise.all(
        [...perDaemon.values()].map(async (list) => {
          const { daemon } = list[0]
          if (!daemon.token || daemon.rejected) throw new Error(`${daemon.name} is not connected`)
          const client = createDaemonClient({ url: daemon.url, token: daemon.token })
          unwrap(await client.POST('/v1/recovery', { body: { session_ids: list.map((e) => e.session.id) } }))
        }),
      )
    },
    onSettled: (_, __, entries) =>
      new Set(entries.map((e) => e.daemon.id)).forEach((id) => void queryClient.invalidateQueries({ queryKey: daemonKey(id, 'sessions') })),
  })
}

/** An interrupted session's page: what happened, and a way to start it again here. */
export function InterruptedState({ daemonId, session }: { daemonId: string; session: Session }) {
  const recover = useRecoverSessions(daemonId)
  return (
    <div className="flex-1 p-4">
      <EmptyState icon={<RotateCcw />} title="Interrupted by a restart">
        <p>
          Its machine restarted under it. Started again, it resumes its conversation in {folderOf(session) ?? 'its folder'}, with the
          options it was started with, and waits for you.
        </p>
        {recover.error ? <Banner tone="error">{recover.error.message}</Banner> : null}
        <Button className="mt-3" disabled={recover.isPending} onClick={() => recover.mutate([session.id])}>
          <RotateCcw /> Start again
        </Button>
      </EmptyState>
    </div>
  )
}
