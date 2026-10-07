import { QueryState } from '@/components/query-state'
import { Button } from '@/components/ui/button'
import { useDevices, useRevokeDevice } from '../api/use-daemon-me'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : 'never')

/** Devices paired with this daemon; any of them can be revoked (a lost phone, an old laptop). */
export function DevicesList({ daemonId }: { daemonId: string }) {
  const devices = useDevices(daemonId, true)
  const revoke = useRevokeDevice(daemonId)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Paired devices</h3>
      <QueryState query={devices} isEmpty={(d) => d.length === 0} empty={<p className="text-sm text-fg-muted">None.</p>}>
        {(list) => (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {list.map((d) => (
              <li key={d.name} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {d.name}
                  {d.current ? <span className="text-fg-muted"> (this device)</span> : null}
                </span>
                <span className="text-xs text-fg-muted">used {when(d.last_used_at)}</span>
                {d.current ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(d.name)}
                    aria-label={`Revoke ${d.name}`}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </section>
  )
}
