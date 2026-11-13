import { useState } from 'react'
import { QueryState } from '@/components/query-state'
import { Button } from '@/components/ui/button'
import { useDevices, useRevokeDevice } from '../api/use-daemon-me'
import { surface, textRole } from '@/components/ui/styles'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : 'never')
const SHOWN = 5 // more than this: the most recently used, and "Show all"

/** Devices paired with this daemon; any of them can be revoked (a lost phone, an old laptop). A long
 *  list shows this device and the most recently used first, the rest on "Show all". */
export function DevicesList({ daemonId }: { daemonId: string }) {
  const devices = useDevices(daemonId, true)
  const revoke = useRevokeDevice(daemonId)
  const [all, setAll] = useState(false)
  return (
    <section aria-labelledby={`devices-${daemonId}`} className="flex flex-col gap-2">
      <h3 id={`devices-${daemonId}`} className={textRole.label}>
        Devices{devices.data?.length ? <span className={textRole.aside}> · {devices.data.length} paired</span> : null}
      </h3>
      <QueryState query={devices} isEmpty={(d) => d.length === 0} empty={<p className={textRole.hint}>None.</p>}>
        {(list) => {
          const sorted = [...list].sort(
            (a, b) => Number(b.current) - Number(a.current) || (b.last_used_at ?? '').localeCompare(a.last_used_at ?? ''),
          )
          const shown = all ? sorted : sorted.slice(0, SHOWN)
          return (
            <>
              <ul className={`${surface.list} flex flex-col`}>
                {shown.map((d) => (
                  <li key={d.name} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {d.name}
                      {d.current ? <span className="text-fg-muted"> (this device)</span> : null}
                    </span>
                    <span className={textRole.meta}>used {when(d.last_used_at)}</span>
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
              {list.length > SHOWN ? (
                <Button variant="ghost" size="sm" className="self-start" aria-expanded={all} onClick={() => setAll(!all)}>
                  {all ? 'Show fewer' : `Show all ${list.length}`}
                </Button>
              ) : null}
            </>
          )
        }}
      </QueryState>
    </section>
  )
}
