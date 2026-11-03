import { useQuery } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import type { MachineUsage } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import { alertText, known, usageParts } from '@/lib/daemons/usage'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

/** One machine's line: CPU over a minute and ten, memory, threads, open files, the capture loop, its
 *  children. Unknown is said so, never 0. */
function MachineLine({ usage }: { usage: MachineUsage }) {
  const alerts = usage.stale ? [] : (usage.alerts ?? [])
  const parts = usageParts(usage)
  return (
    <li className="flex flex-col gap-0.5 py-1.5">
      <p className="text-sm">
        <span className="font-medium">{usage.machine}</span>
        {usage.stale ? <span className="text-fg-muted"> · last heard a while ago</span> : null}
      </p>
      <p className="text-xs text-fg-muted">{parts.join(' · ')}</p>
      {usage.children === null ? (
        <p className="text-xs text-fg-muted">Its child processes: unknown on this system</p>
      ) : usage.children?.length ? (
        <p className="text-xs text-fg-muted">
          {usage.children.map((c) => `${c.name} ${known(c.cpu_percent, '%')} ${known(c.rss_mb, ' MB')}`).join(' · ')}
        </p>
      ) : null}
      {alerts.map((a, i) => (
        <p key={i} className={cn('text-xs text-state-permission')}>
          {alertText(a)}
          {a.detail ? ` — ${a.detail}` : ''}
        </p>
      ))}
    </li>
  )
}

/** What the daemon, and each computer joined to it, uses: sampled there every few seconds. */
export function UsageList({ daemonId }: { daemonId: string }) {
  const client = useDaemonClient(daemonId)
  const usage = useQuery({
    queryKey: daemonKey(daemonId, 'usage'),
    queryFn: async () => unwrap(await client!.GET('/v1/usage')),
    enabled: client !== null,
    refetchInterval: 10_000,
    retry: false,
  })
  if (!usage.data?.length) return null
  return (
    <section aria-label="Usage" className="flex flex-col gap-1">
      <h3 className="text-sm font-medium">Usage</h3>
      <ul className="flex flex-col divide-y divide-border">
        {usage.data.map((u) => (
          <MachineLine key={u.machine} usage={u} />
        ))}
      </ul>
    </section>
  )
}
