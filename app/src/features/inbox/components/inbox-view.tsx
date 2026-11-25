import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { QueryState } from '@/components/query-state'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from './list-skeleton'
import type { InboxItem, InboxPatch } from '@/lib/api/types'
import { usePairedDaemons } from '@/lib/daemons/store'
import {
  InboxConflictError,
  inboxKey,
  doneKey,
  reasonOf,
  useDeleteInboxItem,
  useInbox,
  usePatchInboxItem,
  useReorderInbox,
} from '../api/use-inbox'
import type { InboxDirectory } from '../model/item'
import { DueDialog } from './due-editor'
import { HandDialog } from './hand-dialog'
import { InboxList } from './inbox-list'
import type { Conflict, InboxDialog, RowActions } from './inbox-row'
import { ProjectDialog } from './project-dialog'

type Patch = Omit<InboxPatch, 'if_version'>

/** What a change was, in a few words, for saying it was not saved. */
function describe(patch: Patch): string {
  if (patch.text) return 'your edit'
  if (patch.status === 'done') return 'ticking it done'
  if (patch.status === 'open') return 'opening it again'
  if ('project' in patch) return 'the project'
  if ('due' in patch) return patch.due ? 'the due date' : 'clearing the due date'
  return 'your change'
}

/** The item as the list has it now (after a conflict: as the hub has it). */
function useLatest() {
  const client = useQueryClient()
  const keeper = usePairedDaemons()[0]
  return (id: number): InboxItem | undefined =>
    keeper
      ? [
          ...(client.getQueryData<InboxItem[]>(inboxKey(keeper.id)) ?? []),
          ...(client.getQueryData<InboxItem[]>(doneKey(keeper.id)) ?? []),
        ].find((i) => i.id === id)
      : undefined
}

/**
 * The Inbox and what is done to it: every change sends the version read (`if_version`); one refused because
 * the item changed elsewhere shows the item as it is now and says so in its row, the owner's change offered
 * again (never sent over it by itself). Set project, Due date and Hand to… open as dialogs over it.
 */
export function InboxView({ directory, focus }: { directory: InboxDirectory; /** An item to bring into view. */ focus?: number }) {
  const inbox = useInbox()
  const patch = usePatchInboxItem()
  const remove = useDeleteInboxItem()
  const reorder = useReorderInbox()
  const latest = useLatest()
  const [conflicts, setConflicts] = useState<Record<number, Conflict & { patch: Patch }>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ item: InboxItem; kind: InboxDialog } | null>(null)
  const hues = new Map(directory.projects.map((p) => [p.name, p.hue]))

  const forget = (id: number) =>
    setConflicts((all) => {
      const { [id]: _, ...rest } = all
      return rest
    })
  const change = (item: InboxItem, p: Patch) => {
    forget(item.id)
    setFailure(null)
    patch.mutate(
      { item, patch: p },
      {
        onError: (error) =>
          error instanceof InboxConflictError
            ? setConflicts((all) => ({ ...all, [item.id]: { what: describe(p), patch: p } }))
            : setFailure(reasonOf(error)),
      },
    )
  }
  const onError = { onError: (error: unknown) => setFailure(reasonOf(error)) }

  const actions: RowActions = {
    done: (item, done) => change(item, { status: done ? 'done' : 'open' }),
    edit: (item, text) => change(item, { text }),
    reopen: (item) => change(item, { status: 'open' }),
    remove: (item) => remove.mutate(item, onError),
    open: (item, kind) => setDialog({ item, kind }),
    hueOf: (project) => (project ? (hues.get(project) ?? null) : null),
    sessionName: directory.sessionName,
    conflictOf: (id) => conflicts[id],
    retry: (item) => {
      const mine = conflicts[item.id]
      if (mine) change(latest(item.id) ?? item, mine.patch)
    },
    dismiss: (item) => forget(item.id),
    focus,
  }

  const close = () => setDialog(null)
  return (
    <>
      {failure ? (
        <Banner
          tone="error"
          className="mx-4 mt-3"
          action={
            <Button variant="ghost" size="sm" onClick={() => setFailure(null)}>
              Dismiss
            </Button>
          }
        >
          {failure}
        </Banner>
      ) : null}
      <QueryState query={inbox} skeleton={<ListSkeleton />}>
        {(items) => <InboxList items={items} actions={actions} onReorder={(ids) => reorder.mutate(ids, onError)} />}
      </QueryState>
      {dialog?.kind === 'project' ? (
        <ProjectDialog
          item={dialog.item}
          projects={directory.projects}
          onPick={(project) => change(dialog.item, { project })}
          onClose={close}
        />
      ) : dialog?.kind === 'due' ? (
        <DueDialog item={dialog.item} projects={directory.projects} onSave={(due) => change(dialog.item, due)} onClose={close} />
      ) : dialog?.kind === 'hand' ? (
        <HandDialog item={dialog.item} projects={directory.projects} onClose={close} />
      ) : null}
    </>
  )
}
