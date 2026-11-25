import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

const PROGRESS_MS = 500 // how often a run's progress is read while it runs

const continueKey = (daemonId: string, sessionId: string) => daemonKey(daemonId, 'continue', sessionId)

/** Whether a Remote Control session (the Claude app's, claude.ai's) can be continued in a terminal, its
 *  transcript looked for on its machine (and if not, why); while a run goes, how far it got. */
export function useContinueCheck(daemonId: string, sessionId: string, running: boolean) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: continueKey(daemonId, sessionId),
    enabled: client !== null,
    queryFn: async () => unwrap(await client!.GET('/v1/sessions/{session_id}/continue', { params: { path: { session_id: sessionId } } })),
    refetchInterval: running ? PROGRESS_MS : false,
    staleTime: 0,
  })
}

/** Continue in terminal: closed in the Claude app (archived on the account), then resumed in a pane on its
 *  machine. Its answer says how it ended: `done` (the pane session's id), or `failed` (why; `retry`: run it
 *  again to start the pane). A 409 says why it could not begin. */
export function useContinueInTerminal(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      unwrap(await client!.POST('/v1/sessions/{session_id}/continue', { params: { path: { session_id: sessionId } } })),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'sessions') })
      void queryClient.invalidateQueries({ queryKey: continueKey(daemonId, sessionId) })
    },
  })
}
