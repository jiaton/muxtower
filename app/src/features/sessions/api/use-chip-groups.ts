import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import { usePairedDaemons } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'
import type { ChipGroup } from '../model/chip-groups'

const NONE: ChipGroup[] = []

/** The daemon that keeps the groups: the first one this device talks to (the hub; while it is down, a
 *  node of it, which asks the hub and fails until it is back). */
function useKeeper() {
  return usePairedDaemons()[0] ?? null
}

/** The owner's groups of projects, the same on every device; none from a daemon too old to keep them. */
export function useChipGroups(): ChipGroup[] {
  const keeper = useKeeper()
  const query = useQuery({
    queryKey: daemonKey(keeper?.id ?? '-', 'chip-groups'),
    enabled: keeper !== null,
    retry: false,
    refetchInterval: 60_000, // another device's change shows within a minute (and when the app comes back)
    queryFn: async (): Promise<ChipGroup[]> =>
      unwrap(await createDaemonClient(keeper!).GET('/v1/chip-groups')).groups.map((g) => ({ ...g, sessions: g.sessions ?? [] })),
  })
  return query.data ?? NONE
}

/** Puts the whole ordered list, shown at once. */
export function useSaveChipGroups() {
  const keeper = useKeeper()
  const client = useQueryClient()
  const key = daemonKey(keeper?.id ?? '-', 'chip-groups')
  return useMutation({
    mutationFn: async (groups: ChipGroup[]) => {
      if (!keeper) throw new Error('No daemon to keep the groups')
      return unwrap(await createDaemonClient(keeper).PUT('/v1/chip-groups', { body: { groups } })).groups.map((g) => ({ ...g, sessions: g.sessions ?? [] }))
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
