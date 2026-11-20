import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import { usePairedDaemons } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'

const NONE: string[] = []

/** The daemon that keeps the order: the first one this device talks to (the hub; while it is down, a node of
 *  it, which asks the hub and fails until it is back), as for the chip groups. */
function useKeeper() {
  return usePairedDaemons()[0] ?? null
}

const keyOf = (id: string) => daemonKey(id, 'project-order')

/** The owner's order of projects in the list grouped by project, the same on every device; none from a
 *  daemon too old to keep it (the list then goes by name). */
export function useProjectOrder(): string[] {
  const keeper = useKeeper()
  const query = useQuery({
    queryKey: keyOf(keeper?.id ?? '-'),
    enabled: keeper !== null,
    retry: false,
    refetchInterval: 60_000, // another device's change shows within a minute (and when the app comes back)
    queryFn: async (): Promise<string[]> => unwrap(await createDaemonClient(keeper!).GET('/v1/project-order')).projects,
  })
  return query.data ?? NONE
}

/** Puts the whole order, shown at once (and put back if the hub refuses it). */
export function useSaveProjectOrder() {
  const keeper = useKeeper()
  const client = useQueryClient()
  const key = keyOf(keeper?.id ?? '-')
  return useMutation({
    mutationFn: async (projects: string[]) => {
      if (!keeper) throw new Error('No daemon to keep the order')
      return unwrap(await createDaemonClient(keeper).PUT('/v1/project-order', { body: { projects } })).projects
    },
    onMutate: async (projects) => {
      await client.cancelQueries({ queryKey: key })
      const before = client.getQueryData<string[]>(key)
      client.setQueryData(key, projects)
      return { before }
    },
    onError: (_, __, context) => client.setQueryData(key, context?.before),
    onSuccess: (projects) => client.setQueryData(key, projects),
  })
}
