import { useMutation, useQuery } from '@tanstack/react-query'
import { check, unwrap } from '@/lib/api/client'
import { useStreamSubscription } from '@/lib/api/streams'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

export const SCREEN_HISTORY = 300

/** The session's screen (ANSI, with scrollback). Loaded once over HTTP, then kept live by the stream. */
export function useScreen(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  useStreamSubscription(daemonId, { type: 'subscribe', topic: 'screen', session_id: sessionId, history: SCREEN_HISTORY })
  return useQuery({
    queryKey: daemonKey(daemonId, 'screen', sessionId),
    enabled: client !== null,
    staleTime: Infinity,
    queryFn: async () => {
      const screen = unwrap(
        await client!.GET('/v1/sessions/{session_id}/screen', {
          params: { path: { session_id: sessionId }, query: { history: SCREEN_HISTORY } },
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

export function useResize(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  return useMutation({
    mutationFn: async (size: { cols: number; rows: number }) =>
      check(
        await client!.POST('/v1/sessions/{session_id}/resize', { params: { path: { session_id: sessionId } }, body: size }),
      ),
  })
}
