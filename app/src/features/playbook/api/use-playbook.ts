import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import { usePairedDaemons, useDaemon } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'

/** The daemon the playbook is asked of: the one given (Settings), else the first this device talks to (the
 *  hub; a node asks its hub). */
function useKeeper(daemonId?: string) {
  const given = useDaemon(daemonId ?? '')
  const first = usePairedDaemons()[0] ?? null
  return daemonId ? (given ?? null) : first
}

/** The shared playbook and the projects' own, and (`project`) what a session of it reads. */
export function usePlaybook(daemonId?: string, project?: string | null) {
  const keeper = useKeeper(daemonId)
  return useQuery({
    queryKey: daemonKey(keeper?.id ?? '-', 'playbook', project ?? ''),
    enabled: keeper !== null,
    retry: false,
    queryFn: async () =>
      unwrap(
        await createDaemonClient(keeper!).GET('/v1/playbook', {
          params: { query: project === undefined ? {} : { effective_for: project ?? '' } },
        }),
      ),
  })
}

export function usePlaybookVersions(daemonId: string, scope: string) {
  const keeper = useKeeper(daemonId)
  return useQuery({
    queryKey: daemonKey(keeper?.id ?? '-', 'playbook', 'versions', scope),
    enabled: keeper !== null,
    queryFn: async () => unwrap(await createDaemonClient(keeper!).GET('/v1/playbook/{scope}/versions', { params: { path: { scope } } })),
  })
}

function useRefresh(daemonId: string) {
  const keeper = useKeeper(daemonId)
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: daemonKey(keeper?.id ?? '-', 'playbook') })
}

/** Saves a new version (409, said as it is, when another was saved since `base_version`). */
export function useSavePlaybook(daemonId: string) {
  const keeper = useKeeper(daemonId)
  const refresh = useRefresh(daemonId)
  return useMutation({
    mutationFn: async ({ scope, text, mode, base }: { scope: string; text: string; mode: 'add' | 'replace'; base: number }) =>
      unwrap(
        await createDaemonClient(keeper!).PUT('/v1/playbook/{scope}', {
          params: { path: { scope } },
          body: { text, mode, base_version: base },
        }),
      ),
    onSettled: refresh,
  })
}

export function useRevertPlaybook(daemonId: string) {
  const keeper = useKeeper(daemonId)
  const refresh = useRefresh(daemonId)
  return useMutation({
    mutationFn: async ({ scope, version }: { scope: string; version: number }) =>
      unwrap(await createDaemonClient(keeper!).POST('/v1/playbook/{scope}/revert', { params: { path: { scope } }, body: { version } })),
    onSettled: refresh,
  })
}
