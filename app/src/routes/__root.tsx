import { Link, Outlet, createRootRoute, useMatch } from '@tanstack/react-router'
import { Server } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { navItemClass } from '@/components/ui/nav'
import { AppUpdateBanner } from '@/features/daemons/components/app-update-banner'
import { WebUsageMark } from '@/features/daemons/components/web-usage-mark'
import { NewSessionHost } from '@/features/sessions/components/new-session-host'
import { PaletteHost } from '@/features/palette/components/palette-host'
import { SessionsNav } from '@/features/sessions/components/sessions-nav'
import { useKeepPushSubscriptions } from '@/features/push/hooks/use-keep-push-subscriptions'
import { settledIn, useCloseSettledNotifications, useNotificationClicks } from '@/features/push/hooks/use-notifications'
import { useForgetRemovedScreens } from '@/features/terminal/screen-store'
import { useAllSessions } from '@/features/sessions/api/use-sessions'
import { isSettled } from '@/features/sessions/model/facets'
import { useDaemonStreams, useRecheckRejected } from '@/lib/api/streams'
import { useDaemonsNeedALook } from '@/features/daemons/hooks/use-daemons-need-a-look'
import { Dot } from '@/components/ui/indicators'
import { useHubFallback } from '@/lib/daemons/use-hub-fallback'
import { useConfiguredDaemons } from '@/lib/runtime-config'
import { useColorScheme } from '@/lib/use-color-scheme'
import { Drawer } from '@/components/ui/drawer'
import { useDrawerHistory, useLayoutDrawer } from '@/lib/layout-drawer'
import { useLayoutShortcut, usePanes } from '@/lib/layout-prefs'
import { PanesSwitch } from './-panes'
import { ink, look } from '@/components/ui/intents'

export const Route = createRootRoute({ component: RootLayout })

/** What the sidebar holds, docked or in the drawer: the layout switch (from `md`), views, devices with
 *  their folders, agents, sources; the daemons. In the drawer, a scope chosen replaces the page the drawer
 *  opened on (`useDrawerHistory`), and closes it. */
function Sidebar({ inDrawer = false }: { inDrawer?: boolean }) {
  const needsALook = useDaemonsNeedALook()
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <PanesSwitch />
        {/* In a drawer the switch is enough: no wordmark cut to "muxto…" beside it. */}
        {inDrawer ? null : (
          <Link to="/" className={`${ink.brand} truncate`}>
            muxtower
          </Link>
        )}
        <WebUsageMark />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <SessionsNav replace={inDrawer} />
      </div>
      <div className={`${look.rule.top} shrink-0 p-2`}>
        <Link to="/daemons" replace={inDrawer} className={navItemClass} title={needsALook ?? undefined}>
          <Server aria-hidden /> Daemons
          {needsALook ? <Dot tone="warning" className="ml-auto" /> : null}
        </Link>
      </div>
    </>
  )
}

/**
 * The app shell: a sidebar (the layout switch; sessions by view, device and folder; daemons), docked where
 * the layout and the screen have it, else in the one drawer (alone, pushing the page aside; or beside the
 * list in the list's drawer, `_sessions`); no tab bar (Daemons is seldom needed: the sidebar, ⌘K and
 * Settings reach it, and a dot on the panel-left says when it wants a look).
 */
function RootLayout() {
  useColorScheme()
  useConfiguredDaemons()
  useDaemonStreams()
  useHubFallback()
  useRecheckRejected()
  useKeepPushSubscriptions()
  useNotificationClicks()
  useForgetRemovedScreens()
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
  const sessionOpen = Boolean(useMatch({ from: '/_sessions/d/$daemonId/s/$sessionId', shouldThrow: false }))
  const panes = usePanes(sessionOpen)
  useLayoutShortcut(panes.split)
  const open = useLayoutDrawer((s) => s.open)
  const setOpen = useLayoutDrawer((s) => s.setOpen)
  const setPull = useLayoutDrawer((s) => s.setPull)
  const slot = useLayoutDrawer((s) => s.sidebarSlot)
  // The drawer is the list's (in `_sessions`, the sidebar beside the list from `md`) or the sidebar's alone.
  useDrawerHistory(panes.listInDrawer || panes.sidebarAlone)
  const content = useRef<HTMLDivElement>(null)
  const pushed = open && panes.sidebarAlone
  // Another drawer, or none (docked again: a wider layout, the window widened; a phone back on its list):
  // what was open is gone, and is not open when it next comes back.
  const kind = panes.listInDrawer ? 'list' : panes.sidebarAlone ? 'sidebar' : null
  useEffect(() => {
    if (useLayoutDrawer.getState().open) setOpen(false)
  }, [kind, setOpen])

  return (
    <div className="flex h-dvh overflow-hidden pt-[env(safe-area-inset-top)]">
      <NewSessionHost />
      <PaletteHost />
      {panes.sidebarDocked ? (
        <aside className={`${look.bar.side} flex w-56 shrink-0 flex-col xl:w-64`} aria-label="Navigation" data-component="sidebar">
          <Sidebar />
        </aside>
      ) : panes.sidebarAlone ? (
        <Drawer drawer open={open} onOpenChange={setOpen} onPull={setPull} label="Navigation" push={content}>
          <div className={`${look.surface} flex w-full flex-col pt-[env(safe-area-inset-top)]`}>
            <Sidebar inDrawer />
          </div>
        </Drawer>
      ) : panes.listInDrawer && panes.split && slot ? (
        // Beside the list, in its drawer.
        createPortal(<Sidebar inDrawer />, slot)
      ) : null}

      {/* Pushed aside by the sidebar drawer, never resized (a terminal keeps its size): out of reach meanwhile. */}
      <div ref={content} className="flex min-w-0 flex-1 flex-col" inert={pushed} aria-hidden={pushed || undefined}>
        <AppUpdateBanner />
        <main className="flex min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
