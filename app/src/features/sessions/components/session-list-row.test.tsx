import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { wrapper } from '@/test/render'
import { SessionListRow } from './session-list-row'

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const session = {
  id: 's1',
  name: 'Round two',
  runtime: 'claude-code',
  cwd: '/home/me/projects/web',
  source: 'adopted',
  machine: 'hub',
  state: 'idle',
  needs_attention: false,
  notify: 'all',
  capabilities: { rename: true, archive: true, terminate: true, place: true },
  updated_at: '2026-10-25T10:00:00Z',
} as unknown as Session

async function renderRow(on: Daemon = daemon) {
  const root = createRootRoute({ component: () => <SessionListRow entry={{ key: `${on.id}/s1`, daemon: on, session }} /> })
  const router = createRouter({ routeTree: root, history: createMemoryHistory() })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
  return screen.findByRole('link')
}

describe('SessionListRow', () => {
  it('opens its menu on a right click or a long press, instead of the browser’s', async () => {
    const row = await renderRow()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(fireEvent.contextMenu(row, { clientX: 40, clientY: 12 })).toBe(false) // not the browser's own menu
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Pin/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /All/ })).toBeInTheDocument()
  })
})

describe('the open session’s row', () => {
  it('marked unread from its menu, it leaves the session first, then marks it (being shown would read it again)', async () => {
    const { Outlet, createRoute } = await import('@tanstack/react-router')
    const { http, HttpResponse } = await import('msw')
    const { addDaemon } = await import('@/test/render')
    const { DAEMON_URL, server } = await import('@/test/server')
    const hub = addDaemon()
    const order: string[] = []
    server.use(
      http.post(`${DAEMON_URL}/v1/sessions/s1/read`, async ({ request }) => {
        order.push(`read ${JSON.stringify(await request.json())} at ${router.state.location.pathname}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const root = createRootRoute()
    const sessions = createRoute({
      getParentRoute: () => root,
      id: '_sessions',
      component: () => (
        <>
          <SessionListRow entry={{ key: `${hub.id}/s1`, daemon: hub, session }} />
          <Outlet />
        </>
      ),
    })
    const list = createRoute({ getParentRoute: () => sessions, path: '/' })
    const page = createRoute({ getParentRoute: () => sessions, path: 'd/$daemonId/s/$sessionId' })
    const router = createRouter({
      routeTree: root.addChildren([sessions.addChildren([list, page])]),
      history: createMemoryHistory({ initialEntries: [`/d/${hub.id}/s/s1`] }),
    })
    const Wrapper = wrapper()
    render(
      <Wrapper>
        <RouterProvider router={router} />
      </Wrapper>,
    )
    fireEvent.contextMenu(await screen.findByRole('link'), { clientX: 40, clientY: 12 })
    fireEvent.click(await screen.findByRole('menuitem', { name: /unread/i }))
    await vi.waitFor(() => expect(order).toEqual(['read {"read":false} at /']))
  })
})

describe('the row’s menu from the keyboard', () => {
  it('opens on "." (or Shift+F10) on the focused row, shows each item’s key, and a key does the item', async () => {
    const { http, HttpResponse } = await import('msw')
    const { DAEMON_URL, server } = await import('@/test/server')
    const pinned: unknown[] = []
    server.use(
      http.post(`${DAEMON_URL}/v1/sessions/s1/pin`, async ({ request }) => {
        pinned.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { addDaemon } = await import('@/test/render')
    const row = await renderRow(addDaemon())
    row.focus()
    fireEvent.keyDown(row, { key: '.' })
    const menu = await screen.findByRole('menu')
    const rename = screen.getByRole('menuitem', { name: /Rename/ })
    expect(rename).toHaveAttribute('aria-keyshortcuts', 'R')
    expect(screen.getByRole('menuitem', { name: /unread/i })).toHaveAttribute('aria-keyshortcuts', 'U')
    // One key each: no two items share one.
    const keys = [...menu.querySelectorAll('[data-shortcut]')].map((el) => el.getAttribute('data-shortcut'))
    expect(new Set(keys).size).toBe(keys.length)
    fireEvent.keyDown(menu, { key: 'p' })
    await vi.waitFor(() => expect(pinned).toHaveLength(1))
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull()) // done, and closed
  })
})
