import { Link, Outlet, createRootRoute, useMatch } from '@tanstack/react-router'
import { Layers, Plus, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navItemClass, tabItemClass } from '@/components/ui/nav'
import { AppUpdateBanner } from '@/features/daemons/components/app-update-banner'
import { WebUsageMark } from '@/features/daemons/components/web-usage-mark'
import { NewSessionDialog } from '@/features/sessions/components/new-session-dialog'
import { SessionsNav } from '@/features/sessions/components/sessions-nav'
import { useListMemory } from '@/features/sessions/store'
import { useKeepPushSubscriptions } from '@/features/push/hooks/use-keep-push-subscriptions'
import { useCloseSettledNotifications, useNotificationClicks } from '@/features/push/hooks/use-notifications'
import { useAllSessions } from '@/features/sessions/api/use-sessions'
import { isSettled } from '@/features/sessions/model/facets'
import { useDaemonStreams, useRecheckRejected } from '@/lib/api/streams'
import { useHubFallback } from '@/lib/daemons/use-hub-fallback'
import { cn } from '@/lib/cn'
import { useConfiguredDaemons } from '@/lib/runtime-config'
import { useColorScheme } from '@/lib/use-color-scheme'

export const Route = createRootRoute({ component: RootLayout })

/**
 * The app shell. From `lg`: a sidebar (sessions by view, device and folder; daemons). Below: a bottom
 * tab bar, hidden while a session is open on a phone (the session page has its own back and input).
 */
function RootLayout() {
  useColorScheme()
  useConfiguredDaemons()
  useDaemonStreams()
  useHubFallback()
  useRecheckRejected()
  useKeepPushSubscriptions()
  useNotificationClicks()
  const daemons = useAllSessions()
  useCloseSettledNotifications(
    (daemonId, sessionId, since) => {
      const known = daemons.find((d) => d.daemon.id === daemonId)
      const session = known && known.updatedAt >= since ? known.sessions.find((s) => s.id === sessionId) : undefined
      return session && isSettled(session)
    },
    daemons.map((d) => d.updatedAt).join(),
  )
  const inSession = useMatch({ from: '/_sessions/d/$daemonId/s/$sessionId', shouldThrow: false }) !== undefined
  const lastSearch = useListMemory((s) => s.lastSearch)

  return (
    <div className="flex h-dvh overflow-hidden pt-[env(safe-area-inset-top)]">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface lg:flex xl:w-64" aria-label="Navigation">
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <Link to="/" className="font-mono font-semibold">
            muxtower
          </Link>
          <WebUsageMark />
          <div className="ml-auto">
            <NewSessionDialog
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label="New session" title="New session">
                  <Plus />
                </Button>
              }
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <SessionsNav />
        </div>
        <div className="shrink-0 border-t border-border p-2">
          <Link to="/daemons" className={navItemClass}>
            <Server aria-hidden /> Daemons
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppUpdateBanner />
        <main className="flex min-h-0 flex-1">
          <Outlet />
        </main>
        <nav
          aria-label="Main"
          className={cn(
            'shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden',
            inSession ? 'hidden md:flex' : 'flex',
          )}
        >
          <Link to="/" search={lastSearch} className={tabItemClass} activeOptions={{ includeSearch: false }}>
            <Layers aria-hidden /> Sessions
          </Link>
          <Link to="/daemons" className={tabItemClass}>
            <Server aria-hidden /> Daemons
          </Link>
        </nav>
      </div>
    </div>
  )
}
