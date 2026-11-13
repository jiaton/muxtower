import { useQueries } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import { APP_VERSION, lookForUpdate, newer, reloadIntoNewest, useAppUpdate } from '@/lib/app-update'
import { usePairedDaemons } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'

const CHECK_MS = 60_000

/** The newest muxtower a paired daemon runs, when it is newer than this app (null: none is). */
export function useNewerDaemon(): { name: string; version: string } | null {
  const daemons = usePairedDaemons()
  return useQueries({
    queries: daemons.map((d) => ({
      queryKey: daemonKey(d.id, 'me'), // the same as the login check: one request a minute for both
      queryFn: async () => unwrap(await createDaemonClient(d).GET('/v1/me')),
      refetchInterval: CHECK_MS,
    })),
    combine: (results) => {
      let found: { name: string; version: string } | null = null
      results.forEach((r, i) => {
        const version = r.data?.version
        if (version && newer(version, found?.version ?? APP_VERSION)) found = { name: daemons[i].name, version }
      })
      return found
    },
  })
}

/** Says a newer app is there to reload into: one deployed while it was open, or one a daemon runs. */
export function AppUpdateBanner() {
  const ready = useAppUpdate((s) => s.ready)
  const daemon = useNewerDaemon()
  useEffect(() => {
    if (daemon) lookForUpdate() // a daemon served from the same place has the new app too: fetch it
  }, [daemon])
  if (!ready && !daemon) return null
  return (
    <Banner className="m-2 mb-0 items-center" aria-live="polite">
      <RefreshCw aria-hidden />
      <span className="min-w-0 flex-1">
        {ready
          ? 'A new version is available.'
          : `${daemon!.name} runs muxtower ${daemon!.version}; this page is ${APP_VERSION || 'an older one'}.`}
      </span>
      <Button size="sm" variant="ghost" onClick={() => void reloadIntoNewest()}>
        Reload
      </Button>
    </Banner>
  )
}
