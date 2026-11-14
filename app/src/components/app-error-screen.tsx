import { CircleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ink } from '@/components/ui/intents'
import { reportError } from '@/lib/error-report'

const KEY = 'mxt-error-retry'
const WINDOW_MS = 60_000

/** Whether to reload once on its own: a failure on open is often one that a fresh start does not meet
 *  again. Once a minute at most (counted in sessionStorage, as the recover script counts its tries), so it
 *  can never loop; without storage, never. */
export function retryOnce(store: Storage | null = safeSession(), now = Date.now()): boolean {
  if (!store) return false
  try {
    const last = Number(store.getItem(KEY) ?? 0)
    if (now - last < WINDOW_MS) return false
    store.setItem(KEY, String(now))
    return true
  } catch {
    return false
  }
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** What shows when a page fails to draw (the router's error component): said plainly, with Reload; the
 *  error is reported to the daemon, and the first failure in a while reloads once on its own. */
export function AppErrorScreen({ error, retry = retryOnce }: { error: unknown; retry?: () => boolean }) {
  useEffect(() => {
    reportError('render', error)
    if (retry()) location.reload()
  }, [error, retry])
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div role="alert" className="flex min-h-dvh flex-1 items-center justify-center p-6">
      <EmptyState icon={<CircleAlert />} title="Something went wrong">
        <div className="flex flex-col items-center gap-3">
          <p className={ink.codeMeta}>{message}</p>
          <Button onClick={() => location.reload()}>Reload</Button>
        </div>
      </EmptyState>
    </div>
  )
}
