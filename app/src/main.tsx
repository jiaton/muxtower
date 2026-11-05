import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createHashHistory, createRouter } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { listenForInstall } from './features/install/store'
import { queryClient } from './lib/query'
import { watchForUpdates } from './lib/app-update'
import { routeTree } from './routeTree.gen'
import './styles/tokens.css'

// The demo build (`src/demo/`) lives on a static site that serves one page for it: it routes by the hash.
const router = createRouter(
  import.meta.env.MODE === 'demo' ? { routeTree, history: createHashHistory() } : { routeTree, basepath: import.meta.env.BASE_URL },
)

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

listenForInstall()
watchForUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
