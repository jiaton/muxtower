import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { Session } from '@/lib/api/types'
import { useState } from 'react'
import { useUpdateSession } from '../api/use-session-mutations'
import { agentOf } from '../model/facets'

/** A name of the owner's for the session, kept over the one its agent gives itself, which is offered. */
export function RenameDialog({ daemonId, session, onClose }: { daemonId: string; session: Session; onClose: () => void }) {
  const update = useUpdateSession(daemonId, session.id)
  const [name, setName] = useState(session.name)
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
          {session.agent_name && session.agent_name !== name.trim() ? (
            <button
              type="button"
              className="-mt-1 max-w-full self-start text-left text-sm break-words text-fg-muted hover:text-fg"
              onClick={() => setName(session.agent_name ?? '')}
            >
              {agentOf(session)} calls it <span className="font-medium text-accent">{session.agent_name}</span>: use that
            </button>
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
