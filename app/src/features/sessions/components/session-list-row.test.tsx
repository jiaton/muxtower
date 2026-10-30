import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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

async function renderRow() {
  const root = createRootRoute({ component: () => <SessionListRow entry={{ key: 'd1/s1', daemon, session }} /> })
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
