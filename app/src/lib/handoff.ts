import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import type { HandoffTargets } from '@/lib/api/types'
import { usePairedDaemons } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'

/**
 * Who a project's Inbox items can be handed to, and its default hand-off role: kept on the hub (the first
 * daemon this device talks to, as for the project order and colours). Shared by the Inbox (Hand to…) and the
 * session list (a project header's "Default hand-off role").
 */
function useKeeper() {
  return usePairedDaemons()[0] ?? null
}

export const handoffKey = (daemonId: string, project?: string) =>
  project === undefined ? daemonKey(daemonId, 'handoff-targets') : daemonKey(daemonId, 'handoff-targets', project)

/** The project's live roles (with how many sessions hold each), its live sessions and its default role;
 *  nothing asked while `project` is null. */
export function useHandoffTargets(project: string | null) {
  const keeper = useKeeper()
  return useQuery({
    queryKey: handoffKey(keeper?.id ?? '-', project ?? ''),
    enabled: keeper !== null && Boolean(project),
    retry: false,
    staleTime: 10_000,
    queryFn: async (): Promise<HandoffTargets> =>
      unwrap(await createDaemonClient(keeper!).GET('/v1/projects/{project}/handoff-targets', { params: { path: { project: project! } } })),
  })
}

/** Sets (or, with null, clears) a project's default hand-off role, shown at once where its targets are read. */
export function useSaveHandoff() {
  const keeper = useKeeper()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ project, role }: { project: string; role: string | null }) => {
      if (!keeper) throw new Error('No daemon to keep it')
      return (
        unwrap(await createDaemonClient(keeper).PUT('/v1/projects/{project}/handoff', { params: { path: { project } }, body: { role } }))
          .role ?? null
      )
    },
    onSuccess: (role, { project }) => {
      if (!keeper) return
      client.setQueryData<HandoffTargets>(handoffKey(keeper.id, project), (old) => (old ? { ...old, default_role: role } : old))
      void client.invalidateQueries({ queryKey: handoffKey(keeper.id, project) })
    },
  })
}
