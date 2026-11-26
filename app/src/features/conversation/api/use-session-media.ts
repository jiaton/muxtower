import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { unwrap } from '@/lib/api/client'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'
import { isGone } from './use-shared-file'

/** A picture or video an item shows (`ConversationItem.media`): a file it names, by its path as written, or
 *  an image inside a tool's result, by its item and place. */
export type MediaTarget = { from: 'file'; path: string } | { from: 'inline'; seq: number; index: number }

export const mediaKey = (daemonId: string, sessionId: string, t: MediaTarget) =>
  t.from === 'file' ? daemonKey(daemonId, 'media', sessionId, 'file', t.path) : daemonKey(daemonId, 'media', sessionId, 'inline', t.seq, t.index)

/**
 * Its bytes, fetched with the daemon's token as a blob (an <img> or <video> could not send it), for an object
 * URL: whole, at most 25 MB (the daemon refuses more, 413), so a video seeks within it with no Range of its
 * own and no token in a URL. A thumbnail and its large view share it. Kept for the page's life; asked again
 * only by `refetch` (its machine was away). Nothing is asked for without a `target`, nor while not `enabled`
 * (a video's tile: what an earlier open found is read all the same).
 */
export function useSessionMedia(daemonId: string, sessionId: string, target: MediaTarget | undefined, enabled = true) {
  const client = useDaemonClient(daemonId)
  return useQuery<Blob>({
    queryKey: target ? mediaKey(daemonId, sessionId, target) : daemonKey(daemonId, 'media', sessionId, '-'),
    enabled: enabled && client !== null && target !== undefined,
    staleTime: Infinity,
    retry: false,
    queryFn: async () =>
      unwrap(
        target!.from === 'file'
          ? await client!.GET('/v1/sessions/{session_id}/media', {
              params: { path: { session_id: sessionId }, query: { path: target!.path } },
              parseAs: 'blob',
            })
          : await client!.GET('/v1/sessions/{session_id}/items/{seq}/media/{index}', {
              params: { path: { session_id: sessionId, seq: target!.seq, index: target!.index } },
              parseAs: 'blob',
            }),
      ),
  })
}

const NONE: ReadonlySet<string> = new Set()

/** The gallery keys (`GalleryMedia.key`) of a session's pictures and videos that cannot show, as the query
 *  cache knows them once a thumbnail asked: any failed file or inline image, an old daemon's image by path,
 *  a shared file answered 404. The gallery leaves them out. Read from the cache; nothing is fetched here. */
export function useUnshownMedia(daemonId: string, sessionId: string): ReadonlySet<string> {
  const cache = useQueryClient().getQueryCache()
  const snapshot = useCallback(() => {
    const keys: string[] = []
    for (const q of cache.findAll({ queryKey: daemonKey(daemonId) })) {
      const [, , what, session, ...rest] = q.queryKey as unknown[]
      if (session !== sessionId || !q.state.error) continue
      if (what === 'media' && rest[0] === 'file') keys.push(`file:${String(rest[1])}`)
      else if (what === 'media' && rest[0] === 'inline') keys.push(`inline:${String(rest[1])}:${String(rest[2])}`)
      else if (what === 'image') keys.push(String(rest[0]))
      else if (what === 'shared' && isGone(q.state.error)) keys.push(`shared:${String(rest[0])}`)
    }
    return keys.sort().join('\n')
  }, [cache, daemonId, sessionId])
  const subscribe = useCallback((changed: () => void) => cache.subscribe(changed), [cache])
  const keys = useSyncExternalStore(subscribe, snapshot, snapshot)
  return useMemo(() => (keys ? new Set(keys.split('\n')) : NONE), [keys])
}
