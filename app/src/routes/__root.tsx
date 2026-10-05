import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { useBundledDaemon } from '@/features/daemons/api/use-bundled-daemon'
import { useColorScheme } from '@/lib/use-color-scheme'

export const Route = createRootRoute({ component: RootLayout })

const navLink = 'rounded-md px-3 py-1.5 text-sm text-fg-muted hover:text-fg [&.active]:bg-surface-muted [&.active]:text-fg'

function RootLayout() {
  useColorScheme()
  useBundledDaemon()
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="mr-auto font-mono font-semibold">muxtower</span>
        <nav className="flex gap-1" aria-label="Main">
          <Link to="/" className={navLink}>
            Inbox
          </Link>
          <Link to="/daemons" className={navLink}>
            Daemons
          </Link>
        </nav>
      </header>
      <main className="flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
