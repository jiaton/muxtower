import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import { usePairedDaemons } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'
import type { ChipGroup } from '../model/chip-groups'
import { useKeptChipGroups } from './kept-chip-groups'

const NONE: ChipGroup[] = []

/** The daemon that keeps the groups: the first one this device talks to (the hub; while it is down, a
 *  node of it, which asks the hub and fails until it is back). */
function useKeeper() {
  return usePairedDaemons()[0] ?? null
}

/**
 * The owner's groups of projects, the same on every device (none from a daemon too old to keep them), and whether they are known: the keeper's answer, or, until it comes (the hub restarting, the
 * app opening again), the ones it last gave (`useKeptChipGroups`). Not known only before this browser ever
 * had an answer: the row shows a placeholder then, not the projects it shows when there are no groups.
 */
export function useChipGroupsState(): { groups: ChipGroup[]; known: boolean } {
  const keeper = useKeeper()
  const kept = useKeptChipGroups((s) => (keeper ? s.byDaemon[keeper.id] : undefined))
  const keep = useKeptChipGroups((s) => s.keep)
  const query = useQuery({
    queryKey: daemonKey(keeper?.id ?? '-', 'chip-groups'),
    enabled: keeper !== null,
    // A restarting hub (5xx, no answer) is asked again a few times (the default, `lib/query.ts`); a daemon
    // too old to keep groups (404) is not.
    refetchInterval: 60_000, // another device's change shows within a minute (and when the app comes back)
    queryFn: async (): Promise<ChipGroup[]> =>
      unwrap(await createDaemonClient(keeper!).GET('/v1/chip-groups')).groups.map((g) => ({ ...g, sessions: g.sessions ?? [] })),
  })
  useEffect(() => {
    if (keeper && query.data) keep(keeper.id, query.data)
  }, [keeper, query.data, keep])
  if (query.data) return { groups: query.data, known: true }
  if (kept) return { groups: kept, known: true }
  // Not answered after its retries (a daemon too old to keep groups, a hub still down): none, as known.
  return { groups: NONE, known: keeper === null || query.isError }
}

/** Puts the whole ordered list, shown at once. */
export function useSaveChipGroups() {
  const keeper = useKeeper()
  const client = useQueryClient()
  const key = daemonKey(keeper?.id ?? '-', 'chip-groups')
  return useMutation({
    mutationFn: async (groups: ChipGroup[]) => {
      if (!keeper) throw new Error('No daemon to keep the groups')
      return unwrap(await createDaemonClient(keeper).PUT('/v1/chip-groups', { body: { groups } })).groups.map((g) => ({
        ...g,
        sessions: g.sessions ?? [],
      }))
    },
    onMutate: async (groups) => {
      await client.cancelQueries({ queryKey: key })
      const before = client.getQueryData<ChipGroup[]>(key)
      client.setQueryData(key, groups)
      return { before }
    },
    onError: (_, __, context) => client.setQueryData(key, context?.before),
    onSuccess: (groups) => client.setQueryData(key, groups),
  })
}

export const newChipId = () => Math.random().toString(36).slice(2, 10)
