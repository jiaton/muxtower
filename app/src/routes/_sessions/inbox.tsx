import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Pane, PaneBody, PaneHeader } from '@/components/ui/pane'
import { useInboxItems } from '@/features/inbox/api/use-inbox'
import { InboxView } from '@/features/inbox/components/inbox-view'
import { QuickAddForm } from '@/features/inbox/components/quick-add'
import { openCount } from '@/features/inbox/model/item'
import { useQuickAdd } from '@/features/inbox/store'
import { withKeys } from '@/lib/shortcuts'
import { SPLIT_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { useInboxDirectory } from '../-inbox-directory'

/** `item`: an item to bring into view (a tapped Inbox notification). */
export const Route = createFileRoute('/_sessions/inbox')({
  validateSearch: (s: Record<string, unknown>): { item?: number } => {
    const item = Number(s.item)
    return Number.isInteger(item) && item > 0 ? { item } : {}
  },
  component: InboxPage,
})

/** On a phone, the quick-add form opens in place at the top of the sheet (a second sheet over it would fight
 *  it for the focus). */
function PhoneAdd() {
  const { projects } = useInboxDirectory()
  const [open, setOpen] = useState(false)
  if (open)
    return (
      <div className="px-4 pb-3">
        <QuickAddForm projects={projects} onDone={() => setOpen(false)} />
      </div>
    )
  return (
    <div className="px-3 pb-1">
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus /> Add to Inbox
      </Button>
    </div>
  )
}

function AddButton() {
  const setOpen = useQuickAdd((s) => s.setOpen)
  const label = withKeys('Add to Inbox', 'quickAdd')
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={() => setOpen(true)}>
      <Plus />
    </Button>
  )
}

/** The Inbox: the owner's ideas and to-dos across projects. Beside the session list where a session would
 *  open (from `md`); on a phone a sheet over the list. */
function InboxPage() {
  const phone = !useMediaQuery(SPLIT_QUERY) // where nothing opens beside the list
  const navigate = useNavigate()
  const directory = useInboxDirectory()
  const { item } = Route.useSearch()
  const open = openCount(useInboxItems())
  const subtitle = `Across projects · ${open} open`
  if (phone)
    return (
      <Dialog open onOpenChange={(o) => o || void navigate({ to: '/' })}>
        <DialogContent title="Inbox" description={subtitle} fill>
          <PhoneAdd />
          <InboxView directory={directory} focus={item} />
        </DialogContent>
      </Dialog>
    )
  return (
    <Pane className="flex-1" aria-label="Inbox" data-component="inbox">
      <PaneHeader title={<h1>Inbox</h1>} subtitle={subtitle} actions={<AddButton />} />
      <PaneBody>
        <div className="mx-auto w-full max-w-3xl">
          <InboxView directory={directory} focus={item} />
        </div>
      </PaneBody>
    </Pane>
  )
}
