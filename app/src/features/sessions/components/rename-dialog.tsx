import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { Session } from '@/lib/api/types'
import { ago } from '@/lib/time'
import { useState } from 'react'
import { useSessionNames } from '../api/use-session-names'
import { useUpdateSession } from '../api/use-session-mutations'
import { agentOf } from '../model/facets'
import { textRole } from '@/components/ui/styles'

/** Where a name it went by came from, as the dialog says it. */
const FROM: Record<string, string> = {
  muxtower: 'earlier name',
  claude: "Claude's title",
  'set in claude': 'set in Claude',
  'remote control': 'Remote Control title',
  codex: "Codex's name",
}

export interface Suggestion {
  name: string
  from: string
  at?: string
}

/** The names to offer: the ones it went by (latest first), or, from a daemon that keeps none, the one its
 *  agent gives it; never the name in the box. */
export function suggestions(
  session: Session,
  names: { name: string; source: string; last_seen: string }[] | undefined,
  typed: string,
): Suggestion[] {
  const offered: Suggestion[] = names
    ? names.map((n) => ({ name: n.name, from: FROM[n.source] ?? n.source, at: n.last_seen }))
    : session.agent_name
      ? [{ name: session.agent_name, from: `${agentOf(session)}'s name` }]
      : []
  return offered.filter((s) => s.name !== typed.trim())
}

/** A name of the owner's for the session, kept over the ones its agent gives itself, which are offered. */
export function RenameDialog({ daemonId, session, onClose }: { daemonId: string; session: Session; onClose: () => void }) {
  const update = useUpdateSession(daemonId, session.id)
  const names = useSessionNames(daemonId, session.id)
  const [name, setName] = useState(session.name)
  const offered = suggestions(session, names.data, name)
  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent title="Rename session">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            update.mutate({ name: name.trim() }, { onSuccess: onClose })
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required aria-label="Session name" autoFocus />
          {offered.length ? (
            <section aria-label="Other names" className="-mt-1 flex flex-col">
              <h3 className={textRole.meta}>Other names it went by</h3>
              <ul className="flex flex-col">
                {offered.map((s) => (
                  <li key={s.name}>
                    <button
                      type="button"
                      className="flex w-full items-baseline gap-2 rounded-md px-1 py-1 text-left hover:bg-surface-muted"
                      onClick={() => setName(s.name)}
                    >
                      <span className="min-w-0 flex-1 text-sm break-words text-accent">{s.name}</span>
                      <span className={`${textRole.meta} shrink-0`}>
                        {s.from}
                        {s.at ? ` · ${ago(s.at)}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {update.error ? <Banner tone="error">{update.error.message}</Banner> : null}
          <Button type="submit" disabled={update.isPending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
