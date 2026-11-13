import { useQuery } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import type { MachineUsage } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import { alertText, known, usageParts } from '@/lib/daemons/usage'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'
import { ink, look } from '@/components/ui/intents'

/** One machine's line: CPU over a minute and ten, memory, threads, open files, the capture loop, its
 *  children. Unknown is said so, never 0. */
function MachineLine({ usage }: { usage: MachineUsage }) {
  const alerts = usage.stale ? [] : (usage.alerts ?? [])
  const parts = usageParts(usage)
  return (
    <li className="flex flex-col gap-0.5 py-1.5">
      <p className={ink.body}>
        <span className={ink.strong}>{usage.machine}</span>
        {usage.stale ? <span className={ink.quiet}> · last heard a while ago</span> : null}
      </p>
      <p className={ink.meta}>{parts.join(' · ')}</p>
      {usage.children === null ? (
        <p className={ink.meta}>Its child processes: unknown on this system</p>
      ) : usage.children?.length ? (
        <p className={ink.meta}>
          {usage.children.map((c) => `${c.name} ${known(c.cpu_percent, '%')} ${known(c.rss_mb, ' MB')}`).join(' · ')}
        </p>
      ) : null}
      {alerts.map((a, i) => (
        <p key={i} className={cn(ink.noteWarning)}>
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
      <h3 className={ink.label}>Usage</h3>
      <ul className={`${look.rows} flex flex-col`}>
        {usage.data.map((u) => (
          <MachineLine key={u.machine} usage={u} />
        ))}
      </ul>
    </section>
  )
}
