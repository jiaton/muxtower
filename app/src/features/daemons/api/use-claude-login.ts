import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError, check, unwrap } from '@/lib/api/client'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

const RUNNING_CHECK_MS = 1_500

/** Starts `claude auth login` on the daemon's machine: the page to sign in at, and the session waiting
 *  for the code that page gives. */
export function useStartClaudeLogin(daemonId: string) {
  const client = useDaemonClient(daemonId)
  return useMutation({ mutationFn: async () => unwrap(await client!.POST('/v1/claude-login')) })
}

/** The code from the sign-in page, typed into the login session; or the session ended, left unfinished. */
export function useLoginSession(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const path = (sessionId: string) => ({ params: { path: { session_id: sessionId } } })
  return {
    sendCode: useMutation({
      mutationFn: async ({ sessionId, code }: { sessionId: string; code: string }) =>
        check(
          await client!.POST('/v1/sessions/{session_id}/input', {
            ...path(sessionId),
            body: { text: code, key: null, enter: true, images: [] },
          }),
        ),
    }),
    cancel: useMutation({
      mutationFn: async (sessionId: string) => check(await client!.DELETE('/v1/sessions/{session_id}', path(sessionId))),
    }),
  }
}

/** Whether the login's session still runs (it ends once logged in, or given up); undefined until known. */
export function useLoginRunning(daemonId: string, sessionId: string | undefined) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: daemonKey(daemonId, 'claude-login', sessionId ?? ''),
    enabled: client !== null && sessionId !== undefined,
    queryFn: async () => {
      try {
        unwrap(await client!.GET('/v1/sessions/{session_id}', { params: { path: { session_id: sessionId! } } }))
        return true
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return false
        throw error
      }
    },
    refetchInterval: (query) => (query.state.data === false ? false : RUNNING_CHECK_MS),
  }).data
}
