import { useQuery } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import { useStreamStatus, useStreamSubscription } from '@/lib/api/streams'
import type { ConversationItem } from '@/lib/api/types'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

/** A session's structured conversation: the latest items over HTTP, then kept live by the stream
 *  (polled while the stream is down). */
export function useConversation(daemonId: string, sessionId: string, enabled: boolean) {
  const client = useDaemonClient(daemonId)
  const status = useStreamStatus((s) => s.status[daemonId])
  useStreamSubscription(daemonId, enabled ? { type: 'subscribe', topic: 'conversation', session_id: sessionId, history: 0 } : null)
  return useQuery<ConversationItem[]>({
    queryKey: daemonKey(daemonId, 'conversation', sessionId),
    enabled: enabled && client !== null,
    staleTime: Infinity,
    gcTime: 60 * 60_000, // going back to a session shows its conversation at once, as it last was
    refetchInterval: status === 'open' ? false : status === 'blocked' ? 60_000 : 4000,
    queryFn: async () =>
      unwrap(
        await client!.GET('/v1/sessions/{session_id}/conversation', {
          params: { path: { session_id: sessionId }, query: { limit: 200 } },
        }),
      ).items,
  })
}

/** An earlier part of a conversation, from the item `seq` on (a search led there and the latest items do
 *  not reach it). */
export function useConversationFrom(daemonId: string, sessionId: string, seq: number | null) {
  const client = useDaemonClient(daemonId)
  return useQuery<ConversationItem[]>({
    queryKey: daemonKey(daemonId, 'conversation-from', sessionId, seq),
    enabled: seq !== null && client !== null,
    staleTime: 60_000,
    queryFn: async () =>
      unwrap(
        await client!.GET('/v1/sessions/{session_id}/conversation', {
          params: { path: { session_id: sessionId }, query: { around: seq ?? 0, limit: 60 } },
        }),
      ).items,
  })
}
