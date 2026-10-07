import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { Inbox, Server } from 'lucide-react'
import { useDaemonStreams } from '@/lib/api/streams'
import { useConfiguredDaemons } from '@/lib/runtime-config'
import { useColorScheme } from '@/lib/use-color-scheme'

export const Route = createRootRoute({ component: RootLayout })

const navLink =
  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-fg-muted hover:text-fg [&.active]:bg-surface-muted [&.active]:text-fg [&_svg]:size-4'

function RootLayout() {
  useColorScheme()
  useConfiguredDaemons()
  useDaemonStreams()
  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Link to="/" className="mr-auto font-mono font-semibold">
          muxtower
        </Link>
        <nav className="flex gap-1" aria-label="Main">
          <Link to="/" className={navLink} activeOptions={{ exact: true }}>
            <Inbox aria-hidden /> Inbox
          </Link>
          <Link to="/daemons" className={navLink}>
            <Server aria-hidden /> Daemons
          </Link>
        </nav>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
    </div>
  )
}
