import { Link, Outlet, createRootRoute, useMatch } from '@tanstack/react-router'
import { Layers, PanelLeftClose, PanelLeftOpen, Plus, Server } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { navItemClass, tabItemClass } from '@/components/ui/nav'
import { AppUpdateBanner } from '@/features/daemons/components/app-update-banner'
import { WebUsageMark } from '@/features/daemons/components/web-usage-mark'
import { NewSessionDialog } from '@/features/sessions/components/new-session-dialog'
import { NewSessionHost } from '@/features/sessions/components/new-session-host'
import { SessionsNav } from '@/features/sessions/components/sessions-nav'
import { useListMemory } from '@/features/sessions/store'
import { useKeepPushSubscriptions } from '@/features/push/hooks/use-keep-push-subscriptions'
import { settledIn, useCloseSettledNotifications, useNotificationClicks } from '@/features/push/hooks/use-notifications'
import { useAllSessions } from '@/features/sessions/api/use-sessions'
import { isSettled } from '@/features/sessions/model/facets'
import { useDaemonStreams, useRecheckRejected } from '@/lib/api/streams'
import { useHubFallback } from '@/lib/daemons/use-hub-fallback'
import { cn } from '@/lib/cn'
import { useConfiguredDaemons } from '@/lib/runtime-config'
import { useColorScheme } from '@/lib/use-color-scheme'
import { Drawer } from '@/components/ui/drawer'
import { useBackCloses } from '@/lib/use-back-closes'
import { useSidebarDrawer } from '@/lib/sidebar-drawer'
import { SIDEBAR_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { useLayoutPrefs, useSidebarDocked } from '@/lib/layout-prefs'
import { ink, look } from '@/components/ui/intents'

export const Route = createRootRoute({ component: RootLayout })

/** What the sidebar holds, docked or as the phone's drawer: views, devices with their folders, agents,
 *  sources; a new session; the daemons. In the drawer, a scope chosen replaces the page the drawer
 *  opened on (`useBackCloses`), and closes it. */
function Sidebar({ inDrawer = false, onLeave }: { inDrawer?: boolean; onLeave?: () => void }) {
  // Wide enough to dock: docked, it can be hidden (a drawer from then on); hidden, its drawer docks it again.
  const wide = useMediaQuery(SIDEBAR_QUERY)
  const setShown = useLayoutPrefs((s) => s.setSidebar)
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <Link to="/" className={ink.brand}>
          muxtower
        </Link>
        <WebUsageMark />
        <div className="ml-auto flex items-center" onClick={onLeave}>
          <NewSessionDialog
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="New session" title="New session">
                <Plus />
              </Button>
            }
          />
          {wide ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={inDrawer ? 'Keep the sidebar open' : 'Hide the sidebar'}
              title={inDrawer ? 'Keep the sidebar open' : 'Hide the sidebar'}
              onClick={() => setShown(inDrawer)}
            >
              {inDrawer ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <SessionsNav replace={inDrawer} />
      </div>
      <div className={`${look.rule.top} shrink-0 p-2`}>
        <Link to="/daemons" replace={inDrawer} className={navItemClass}>
          <Server aria-hidden /> Daemons
        </Link>
      </div>
    </>
  )
}

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
    (daemonId, sessionId, since) =>
      settledIn(
        daemons.find((d) => d.daemon.id === daemonId),
        sessionId,
        since,
        isSettled,
      ),
    daemons.map((d) => d.updatedAt).join(),
  )
  const inSession = useMatch({ from: '/_sessions/d/$daemonId/s/$sessionId', shouldThrow: false }) !== undefined
  const lastSearch = useListMemory((s) => s.lastSearch)
  const docked = useSidebarDocked()
  const sidebarOpen = useSidebarDrawer((s) => s.open)
  const setSidebarOpen = useSidebarDrawer((s) => s.setOpen)
  const setSidebarPull = useSidebarDrawer((s) => s.setPull)
  const closeSidebar = useBackCloses(sidebarOpen && !docked, setSidebarOpen)
  const content = useRef<HTMLDivElement>(null)
  const pushed = sidebarOpen && !docked

  return (
    <div className="flex h-dvh overflow-hidden pt-[env(safe-area-inset-top)]">
      <NewSessionHost />
      {docked ? (
        <aside className={`${look.bar.side} flex w-56 shrink-0 flex-col xl:w-64`} aria-label="Navigation">
          <Sidebar />
        </aside>
      ) : (
        <Drawer drawer open={sidebarOpen} onOpenChange={closeSidebar} onPull={setSidebarPull} label="Navigation" over push={content}>
          <div className={`${look.surface} flex w-full flex-col pt-[env(safe-area-inset-top)]`}>
            <Sidebar inDrawer onLeave={() => closeSidebar(false)} />
          </div>
        </Drawer>
      )}

      {/* Pushed aside by the sidebar drawer, never resized (a terminal keeps its size): out of reach meanwhile. */}
      <div ref={content} className="flex min-w-0 flex-1 flex-col" inert={pushed} aria-hidden={pushed || undefined}>
        <AppUpdateBanner />
        <main className="flex min-h-0 flex-1">
          <Outlet />
        </main>
        <nav
          aria-label="Main"
          className={cn(`${look.bar.top} shrink-0 pb-[env(safe-area-inset-bottom)] lg:hidden`, inSession ? 'hidden md:flex' : 'flex')}
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
