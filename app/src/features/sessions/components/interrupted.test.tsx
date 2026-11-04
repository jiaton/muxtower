import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import type { SessionEntry } from '../model/facets'
import { InterruptedBanner, byMachine } from './interrupted'

const daemon = { id: 'd1', name: 'hub', url: DAEMON_URL, token: 't' } as Daemon
const entry = (id: string, machine: string, interrupted = true): SessionEntry => ({
  key: `d1/${id}`,
  daemon,
  session: { id, name: id, machine, cwd: `/home/me/${id}`, interrupted_at: interrupted ? '2026-11-03T08:00:00Z' : null } as Session,
})

function renderBanner(entries: SessionEntry[]) {
  const root = createRootRoute({ component: () => <InterruptedBanner entries={entries} /> })
  const router = createRouter({ routeTree: root, history: createMemoryHistory() })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
}

describe('sessions a restart interrupted', () => {
  it('are grouped by machine', () => {
    const groups = byMachine([entry('a', 'hub'), entry('b', 'laptop'), entry('c', 'hub')])
    expect(groups.map((g) => [g.machine, g.entries.map((e) => e.session.id)])).toEqual([
      ['hub', ['a', 'c']],
      ['laptop', ['b']],
    ])
  })

  it('shows nothing while none wait', async () => {
    renderBanner([entry('a', 'hub', false)])
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('starts again only those left ticked, all ticked to begin with', async () => {
    let asked: unknown = null
    server.use(
      http.post(`${DAEMON_URL}/v1/recovery`, async ({ request }) => {
        asked = await request.json()
        return HttpResponse.json([])
      }),
    )
    renderBanner([entry('a', 'hub'), entry('b', 'laptop'), entry('live', 'hub', false)])
    expect(await screen.findByText(/2 sessions were interrupted/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start again/ }))
    expect(await screen.findByRole('button', { name: /Start 2/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /^b/ }))
    fireEvent.click(screen.getByRole('button', { name: /Start 1/ }))
    await waitFor(() => expect(asked).toEqual({ session_ids: ['a'] }))
  })
})
