import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createHashHistory, createRouter } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { watchPage } from '@/lib/diagnostics'
import { createRoot } from 'react-dom/client'
import { listenForInstall } from './features/install/store'
import { queryClient } from './lib/query'
import { watchForUpdates } from './lib/app-update'
import { startWebAnalytics } from './lib/web-analytics'
import { watchErrors } from './lib/error-report'
import { AppErrorScreen } from './components/app-error-screen'
import { routeTree } from './routeTree.gen'
import './styles/tokens.css'

// The demo build (`src/demo/`) lives on a static site that serves one page for it: it routes by the hash.
// A page that fails to draw shows our own screen (reported, reloading once on its own), not the router's.
const defaultErrorComponent = ({ error }: { error: unknown }) => <AppErrorScreen error={error} />
const router = createRouter(
  import.meta.env.MODE === 'demo'
    ? { routeTree, history: createHashHistory(), defaultErrorComponent }
    : { routeTree, basepath: import.meta.env.BASE_URL, defaultErrorComponent },
)

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

watchErrors() // uncaught errors and rejections, told to the daemon
listenForInstall()
watchForUpdates()
startWebAnalytics(import.meta.env.VITE_WEB_ANALYTICS_TOKEN) // the public hosted app's build only

watchPage() // input latency, long frames, the page's growth: Daemons › Diagnostics
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
