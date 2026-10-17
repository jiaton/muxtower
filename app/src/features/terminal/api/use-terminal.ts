import { useMutation, useQuery } from '@tanstack/react-query'
import { check, unwrap } from '@/lib/api/client'
import { useStreamStatus, useStreamSubscription } from '@/lib/api/streams'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

/** History steps: the view asks for the next one when the reader nears the top. */
export const HISTORY_STEPS = [300, 1500, 5000] as const

/** The session's screen (ANSI with `history` lines of scrollback): loaded over HTTP, then kept live by
 *  the stream; polled only while the stream is down. Raising `history` re-subscribes for more. */
export function useScreen(daemonId: string, sessionId: string, history: number) {
  const client = useDaemonClient(daemonId)
  const status = useStreamStatus((s) => s.status[daemonId])
  useStreamSubscription(daemonId, { type: 'subscribe', topic: 'screen', session_id: sessionId, history })
  return useQuery({
    queryKey: daemonKey(daemonId, 'screen', sessionId),
    enabled: client !== null,
    staleTime: Infinity,
    refetchInterval: status === 'open' ? false : status === 'blocked' ? 60_000 : 2000,
    queryFn: async () => {
      const screen = unwrap(
        await client!.GET('/v1/sessions/{session_id}/screen', {
          params: { path: { session_id: sessionId }, query: { history } },
        }),
      )
      return screen.ansi ?? screen.text
    },
  })
}

export function useSendInput(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  return useMutation({
    mutationFn: async (body: { text?: string; key?: string; enter?: boolean }) =>
      check(
        await client!.POST('/v1/sessions/{session_id}/input', {
          params: { path: { session_id: sessionId } },
          body: { text: body.text ?? null, key: body.key ?? null, enter: body.enter ?? false },
        }),
      ),
  })
}

/** Fit the pane to this screen (`size`), or hand the size back to attached terminals (`null`). */
export function usePaneSize(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  return useMutation({
    mutationFn: async (size: { cols: number; rows: number } | null) => {
      const params = { path: { session_id: sessionId } }
      if (size) check(await client!.POST('/v1/sessions/{session_id}/resize', { params, body: size }))
      else check(await client!.POST('/v1/sessions/{session_id}/resize/release', { params }))
    },
  })
}
