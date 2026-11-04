import { useEffect } from 'react'
import { createDaemonClient } from '@/lib/api/client'
import { usePairedDaemons } from '@/lib/daemons/store'
import { pushSupport, renewSubscription } from '../api/use-push'

const renewed = new Set<string>()

/** Once per app start and daemon: registers this browser's push subscription on the daemon again. The
 *  daemon ties it to this device (so revoking the device stops it), and a browser may have changed its
 *  subscription since. */
export function useKeepPushSubscriptions() {
  const daemons = usePairedDaemons()
  useEffect(() => {
    if (pushSupport() !== 'ok') return
    for (const daemon of daemons) {
      if (!daemon.token || daemon.rejected || daemon.via || renewed.has(daemon.id)) continue // push is the hub's
      renewed.add(daemon.id)
      void renewSubscription(createDaemonClient({ url: daemon.url, token: daemon.token }), daemon.id).catch(() => {
        renewed.delete(daemon.id) // try again on the next change
      })
    }
  }, [daemons])
}
