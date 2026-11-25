import { Send } from 'lucide-react'
import { ApiError } from '@/lib/api/client'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { InboxItem } from '@/lib/api/types'
import { reasonOf, useHandInboxItem } from '../api/use-inbox'
import type { InboxProject } from '../model/item'
import { HandPicker, targetName, useHandPick } from './hand-picker'

/** Hand to…: whom (`HandPicker`), then Hand to <them>. Refused (no one holds the role, several do), the
 *  hub's reason shows and the dialog stays. */
export function HandDialog({ item, projects, onClose }: { item: InboxItem; projects: InboxProject[]; onClose: () => void }) {
  const pick = useHandPick(item.project ?? item.handed?.project ?? null)
  const hand = useHandInboxItem()
  const target = pick.target
  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent title="Hand to…" description={<span className="line-clamp-2">“{item.text}”</span>}>
        <HandPicker pick={pick} projects={projects} />
        {hand.isError ? (
          <Banner tone="error">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p>{reasonOf(hand.error)}</p>
              {/* Several hold the role (or none does): one of its sessions can be named instead. */}
              {hand.error instanceof ApiError && hand.error.status === 409 && target?.role && pick.targets.data?.sessions.length ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    hand.reset()
                    pick.showSessions()
                  }}
                >
                  Pick a session instead
                </Button>
              ) : null}
            </div>
          </Banner>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!target || hand.isPending} onClick={() => target && hand.mutate({ item, target }, { onSuccess: onClose })}>
            <Send aria-hidden />
            {target ? `Hand to ${targetName(target, pick.targets.data)}` : 'Hand to…'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
