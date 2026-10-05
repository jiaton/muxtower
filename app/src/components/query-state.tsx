import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/** The one shared loading/error/empty pattern for server-state queries (see app/AGENTS.md). */
export function QueryState<T>({
  query,
  empty,
  isEmpty,
  children,
}: {
  query: UseQueryResult<T>
  empty?: ReactNode
  isEmpty?: (data: T) => boolean
  children: (data: T) => ReactNode
}) {
  if (query.isPending && query.fetchStatus === 'idle') return null // disabled, not loading
  if (query.isPending) return <p className="text-sm text-fg-muted">Loading…</p>
  if (query.isError) return <p className="text-sm text-danger">{query.error.message}</p>
  if (isEmpty?.(query.data)) return <>{empty}</>
  return <>{children(query.data)}</>
}
