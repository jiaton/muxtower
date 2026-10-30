import { useQuery } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

/** An image the session's conversation shows (`ConversationItem.images`), fetched with the daemon's
 *  token (an <img> could not send it). Kept for the page's life: the file behind a path rarely changes. */
export function useSessionImage(daemonId: string, sessionId: string, path: string) {
  const client = useDaemonClient(daemonId)
  return useQuery<Blob>({
    queryKey: daemonKey(daemonId, 'image', sessionId, path),
    enabled: client !== null,
    staleTime: Infinity,
    retry: false,
    queryFn: async () =>
      unwrap(
        await client!.GET('/v1/sessions/{session_id}/image', {
          params: { path: { session_id: sessionId }, query: { path } },
          parseAs: 'blob',
        }),
      ),
  })
}
