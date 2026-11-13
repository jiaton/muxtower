import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { check, createDaemonClient } from '@/lib/api/client'
import { daemonKey } from '@/lib/query'
import { placeOf, type SessionEntry } from '../model/facets'
import { ink, look } from '@/components/ui/intents'

/** Above the Archived list: how long it keeps them, and deleting them all (asked first). Deleting drops
 *  muxtower's own copy only: Claude's transcripts and Remote Control keep theirs. */
export function ArchiveTools({ entries }: { entries: SessionEntry[] }) {
  const archived = entries.filter((e) => placeOf(e.session) === 'archived')
  const [asking, setAsking] = useState(false)
  const remove = useDeleteArchived()
  if (!archived.length) return null
  const n = archived.length
  return (
    <div className={`${look.rule.bottom} ${ink.meta} flex items-center gap-2 px-3 py-2 sm:px-4`}>
      <span className="min-w-0 flex-1">Older ones leave this list after the days set in Settings; they are kept.</span>
      <Button variant="ghost" tone="danger" size="sm" className="shrink-0" onClick={() => setAsking(true)}>
        <Trash2 /> Delete all…
      </Button>
      {asking ? (
        <Dialog open onOpenChange={(open) => !open && setAsking(false)}>
          <DialogContent
            title={`Delete ${n} archived session${n === 1 ? '' : 's'}?`}
            description="They leave the archive here. Only muxtower's copy goes: Claude's transcripts and Remote Control keep theirs."
          >
            {remove.error ? <Banner tone="error">{remove.error.message}</Banner> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(archived, { onSuccess: () => setAsking(false) })}
              >
                <Trash2 /> Delete {n}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

/** Each one deleted on the daemon that lists it (a hub passes a node's on). */
function useDeleteArchived() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (entries: SessionEntry[]) => {
      for (const { daemon, session } of entries) {
        if (!daemon.token || daemon.rejected) throw new Error(`${daemon.name} is not connected`)
        const client = createDaemonClient({ url: daemon.url, token: daemon.token })
        check(await client.DELETE('/v1/sessions/{session_id}', { params: { path: { session_id: session.id } } }))
      }
    },
    onSettled: (_, __, entries) =>
      new Set(entries.map((e) => e.daemon.id)).forEach((id) => void queryClient.invalidateQueries({ queryKey: daemonKey(id, 'sessions') })),
  })
}
