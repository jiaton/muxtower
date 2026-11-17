import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { SearchStatus } from './search-status'

it("shows each machine's index, and a node's own setting one tap away", async () => {
  server.use(
    http.get(`${DAEMON_URL}/v1/search/status`, () =>
      HttpResponse.json({
        here: { state: 'caught_up', size_bytes: 23_700_000 },
        nodes: [
          { node: 'mac', status: { state: 'off', size_bytes: 0 } },
          { node: 'silly', status: null },
        ],
      }),
    ),
  )
  const daemon = addDaemon()
  const root = createRootRoute({ component: () => <SearchStatus daemonId={daemon.id} /> })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={createRouter({ routeTree: root, history: createMemoryHistory() })} />
    </Wrapper>,
  )
  expect(await screen.findByText('Caught up · 24 MB')).toBeInTheDocument()
  expect(screen.getByText('Offline')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Turn on' })).toHaveAttribute('href', expect.stringContaining('node=mac'))
})
