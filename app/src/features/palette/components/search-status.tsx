import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import { ink, look } from '@/components/ui/intents'
import type { components } from '@/lib/api/schema'
import { useDaemon } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'

type IndexStatus = components['schemas']['IndexStatus']

const STATE: Record<IndexStatus['state'], string> = { off: 'Off', indexing: 'Indexing…', caught_up: 'Caught up' }
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`
const said = (s: IndexStatus | null | undefined) =>
  s ? (s.state === 'off' ? STATE.off : `${STATE[s.state]} · ${mb(s.size_bytes)}`) : 'Offline'

/** Under Search in a hub's settings: how far each machine's index got, this one's and each node's; a node's
 *  own setting is one tap away (off there until it is turned on). */
export function SearchStatus({ daemonId }: { daemonId: string }) {
  const daemon = useDaemon(daemonId)
  const status = useQuery({
    queryKey: daemonKey(daemonId, 'search-status'),
    enabled: !!daemon,
    retry: false,
    refetchInterval: 10_000,
    queryFn: async () => unwrap(await createDaemonClient(daemon!).GET('/v1/search/status')),
  })
  const data = status.data
  if (!data) return null
  return (
    <ul className={`${look.rows} flex flex-col`} aria-label="Search index on each machine">
      <li className="flex items-center gap-2 py-1.5">
        <span className={`${ink.body} min-w-0 flex-1 truncate`}>This machine</span>
        <span className={ink.meta}>{said(data.here)}</span>
      </li>
      {(data.nodes ?? []).map((n) => (
        <li key={n.node} className="flex items-center gap-2 py-1.5">
          <span className={`${ink.body} min-w-0 flex-1 truncate`}>{n.node}</span>
          <span className={ink.meta}>{said(n.status)}</span>
          <Link to="/daemons/$daemonId/settings" params={{ daemonId }} search={{ node: n.node }} className={ink.link}>
            {n.status?.state === 'off' ? 'Turn on' : 'Settings'}
          </Link>
        </li>
      ))}
    </ul>
  )
}
