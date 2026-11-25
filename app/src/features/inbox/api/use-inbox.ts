import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, createDaemonClient, unwrap } from '@/lib/api/client'
import type { HandTarget, InboxItem, InboxPatch, NewInboxItem } from '@/lib/api/types'
import { usePairedDaemons } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'

/**
 * The owner's Inbox, kept on the hub: the first daemon this device talks to (as for the project order). The
 * open and handed items are one query, in the owner's order; the done ones of the last 30 days another, read
 * only while shown. Every change shows at once and is put back if the hub refuses it.
 */
function useKeeper() {
  return usePairedDaemons()[0] ?? null
}

export const inboxKey = (daemonId: string) => daemonKey(daemonId, 'inbox')
export const doneKey = (daemonId: string) => daemonKey(daemonId, 'inbox', 'done')

const NONE: InboxItem[] = []

/** The open and handed items, in the owner's order. */
export function useInbox() {
  const keeper = useKeeper()
  return useQuery({
    queryKey: inboxKey(keeper?.id ?? '-'),
    enabled: keeper !== null,
    retry: false,
    refetchInterval: 30_000, // another device's change (or a hand-off the hub made when due) shows soon
    queryFn: async (): Promise<InboxItem[]> => unwrap(await createDaemonClient(keeper!).GET('/v1/inbox')).items,
  })
}

/** The open and handed items, or none yet (the sidebar's count, the quick-add box). */
export const useInboxItems = (): InboxItem[] => useInbox().data ?? NONE

/** Done items of the last 30 days, newest first: asked for only while `shown`. */
export function useDoneItems(shown: boolean) {
  const keeper = useKeeper()
  return useQuery({
    queryKey: doneKey(keeper?.id ?? '-'),
    enabled: keeper !== null && shown,
    retry: false,
    queryFn: async (): Promise<InboxItem[]> =>
      unwrap(await createDaemonClient(keeper!).GET('/v1/inbox', { params: { query: { done: true } } })).done ?? [],
  })
}

/** A PATCH the hub refused because the item changed since it was read: `current` is the item as it is now. */
export class InboxConflictError extends Error {
  readonly current: InboxItem
  constructor(current: InboxItem) {
    super('It changed elsewhere')
    this.current = current
  }
}

/** Puts `item` in place in whichever list it belongs to now (open or done), or takes it out (`gone`). */
function place(client: ReturnType<typeof useQueryClient>, daemonId: string, id: number, item: InboxItem | null) {
  const open = item && item.status !== 'done'
  client.setQueryData<InboxItem[]>(inboxKey(daemonId), (list) => {
    if (!list) return list
    const at = list.findIndex((i) => i.id === id)
    if (!open) return at < 0 ? list : list.filter((i) => i.id !== id)
    return at < 0 ? [item, ...list] : list.map((i) => (i.id === id ? item : i))
  })
  client.setQueryData<InboxItem[]>(doneKey(daemonId), (list) => {
    if (!list) return list
    const rest = list.filter((i) => i.id !== id)
    return item && !open ? [item, ...rest] : rest
  })
}

function snapshot(client: ReturnType<typeof useQueryClient>, daemonId: string) {
  return { open: client.getQueryData<InboxItem[]>(inboxKey(daemonId)), done: client.getQueryData<InboxItem[]>(doneKey(daemonId)) }
}
function restore(client: ReturnType<typeof useQueryClient>, daemonId: string, s: ReturnType<typeof snapshot> | undefined) {
  if (!s) return
  client.setQueryData(inboxKey(daemonId), s.open)
  client.setQueryData(doneKey(daemonId), s.done)
}

/** Adds an item, first in the list. */
export function useAddInboxItem() {
  const keeper = useKeeper()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (body: NewInboxItem) => {
      if (!keeper) throw new Error('No daemon to keep the Inbox')
      return unwrap(await createDaemonClient(keeper).POST('/v1/inbox', { body }))
    },
    onSuccess: (item) => keeper && place(client, keeper.id, item.id, item),
  })
}

/** What a change is made to: the item as it was read (its id and version). */
export interface PatchInput {
  item: InboxItem
  patch: Omit<InboxPatch, 'if_version'>
}

/** The item as a patch makes it, for showing it at once (the hub's answer replaces it). */
function patched(item: InboxItem, patch: PatchInput['patch']): InboxItem {
  const next: InboxItem = { ...item }
  if (patch.text) next.text = patch.text
  if ('project' in patch) next.project = patch.project ?? null
  if (patch.status === 'done') Object.assign(next, { status: 'done', done_at: new Date().toISOString() })
  if (patch.status === 'open') Object.assign(next, { status: 'open', done_at: null, handed: null })
  if ('due' in patch) Object.assign(next, { due: patch.due ?? null, due_has_time: patch.due_has_time ?? false })
  if (patch.on_due) next.on_due = patch.on_due
  if ('due_target' in patch) next.due_target = patch.due_target ?? null
  return next
}

/**
 * Changes an item if it is still at the version read (`if_version`, always sent). Shown at once; refused with
 * 409, it is put as the hub has it now and the error is an `InboxConflictError` holding that: never written
 * over.
 */
export function usePatchInboxItem() {
  const keeper = useKeeper()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ item, patch }: PatchInput) => {
      if (!keeper) throw new Error('No daemon to keep the Inbox')
      const result = await createDaemonClient(keeper).PATCH('/v1/inbox/{item_id}', {
        params: { path: { item_id: item.id } },
        body: { ...patch, if_version: item.version },
      })
      if (result.response.status === 409 && result.error && 'current' in result.error) throw new InboxConflictError(result.error.current)
      return unwrap(result)
    },
    onMutate: async ({ item, patch }) => {
      if (!keeper) return undefined
      await client.cancelQueries({ queryKey: inboxKey(keeper.id) })
      const before = snapshot(client, keeper.id)
      place(client, keeper.id, item.id, patched(item, patch))
      return before
    },
    onError: (error, _, before) => {
      if (!keeper) return
      if (error instanceof InboxConflictError) place(client, keeper.id, error.current.id, error.current)
      else restore(client, keeper.id, before)
    },
    onSuccess: (item) => keeper && place(client, keeper.id, item.id, item),
  })
}

/** Deletes an item, from the list or the history. */
export function useDeleteInboxItem() {
  const keeper = useKeeper()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (item: InboxItem) => {
      if (!keeper) throw new Error('No daemon to keep the Inbox')
      const result = await createDaemonClient(keeper).DELETE('/v1/inbox/{item_id}', { params: { path: { item_id: item.id } } })
      if (!result.response.ok && result.response.status !== 404) unwrap(result)
    },
    onMutate: async (item) => {
      if (!keeper) return undefined
      await client.cancelQueries({ queryKey: inboxKey(keeper.id) })
      const before = snapshot(client, keeper.id)
      place(client, keeper.id, item.id, null)
      return before
    },
    onError: (_, __, before) => keeper && restore(client, keeper.id, before),
  })
}

/** Puts the open and handed items in this order (their ids, first to last). */
export function useReorderInbox() {
  const keeper = useKeeper()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (ids: number[]) => {
      if (!keeper) throw new Error('No daemon to keep the Inbox')
      return unwrap(await createDaemonClient(keeper).PUT('/v1/inbox/order', { body: { ids } })).items
    },
    onMutate: async (ids) => {
      if (!keeper) return undefined
      await client.cancelQueries({ queryKey: inboxKey(keeper.id) })
      const before = snapshot(client, keeper.id)
      client.setQueryData<InboxItem[]>(inboxKey(keeper.id), (list) => {
        if (!list) return list
        const named = ids.flatMap((id) => list.filter((i) => i.id === id))
        return [...named, ...list.filter((i) => !ids.includes(i.id))]
      })
      return before
    },
    onError: (_, __, before) => keeper && restore(client, keeper.id, before),
    onSuccess: (items) => keeper && client.setQueryData(inboxKey(keeper.id), items),
  })
}

/** Hands an item to whoever holds a role in a project, or to one session: one team task. Refused (409: no
 *  one holds the role, several do), the error's message is the hub's reason. */
export function useHandInboxItem() {
  const keeper = useKeeper()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ item, target }: { item: InboxItem; target: HandTarget }) => {
      if (!keeper) throw new Error('No daemon to keep the Inbox')
      return unwrap(
        await createDaemonClient(keeper).POST('/v1/inbox/{item_id}/hand', { params: { path: { item_id: item.id } }, body: target }),
      )
    },
    onSuccess: (item) => keeper && place(client, keeper.id, item.id, item),
  })
}

/** The hub's reason for refusing, said plainly. */
export const reasonOf = (error: unknown): string =>
  error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong'
