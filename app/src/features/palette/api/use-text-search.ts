import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'
import { usePairedDaemons } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'
import { searchTerms } from '@/features/sessions/model/match'

export type SearchHit = components['schemas']['SearchHit']

export const DEBOUNCE_MS = 200
export const LIMIT = 12

function useDebounced(value: string, ms: number): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/** What was said in the conversations, for what is typed in the palette: asked of the hub once typing
 *  pauses, an earlier question cancelled; a node too slow to answer with the others is asked on its own,
 *  and said to be searching meanwhile. */
export function useTextSearch(query: string, enabled: boolean) {
  const hub = usePairedDaemons()[0] ?? null
  const text = searchTerms(useDebounced(query, DEBOUNCE_MS)).text.trim()
  const on = enabled && hub !== null && text.length > 0
  const main = useQuery({
    queryKey: daemonKey(hub?.id ?? '-', 'search', text),
    enabled: on,
    retry: false,
    staleTime: 30_000,
    queryFn: async ({ signal }) =>
      unwrap(await createDaemonClient(hub!).GET('/v1/search', { params: { query: { q: text, limit: LIMIT } }, signal })),
  })
  const late = on ? (main.data?.late ?? []) : []
  const nodes = useQueries({
    queries: late.map((node) => ({
      queryKey: daemonKey(hub?.id ?? '-', 'search', text, node),
      retry: false,
      staleTime: 30_000,
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        unwrap(await createDaemonClient(hub!).GET('/v1/search', { params: { query: { q: text, limit: LIMIT, node } }, signal })),
    })),
  })
  const hits: SearchHit[] = on ? [...(main.data?.hits ?? []), ...nodes.flatMap((n) => n.data?.hits ?? [])] : []
  const searching = on ? [...(main.isFetching ? ['…'] : []), ...late.filter((_, i) => nodes[i]?.isPending)] : []
  return { hubId: hub?.id ?? null, hits, searching, off: Boolean(main.data?.off), pending: on && text !== searchTerms(query).text.trim() }
}
