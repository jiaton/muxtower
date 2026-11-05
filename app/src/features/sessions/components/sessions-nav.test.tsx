import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Session } from '@/lib/api/types'
import { wrapper } from '@/test/render'
import type { SessionEntry } from '../model/facets'
import { SessionsNav } from './sessions-nav'

const daemon = { id: 'd1', name: 'nas', url: 'http://nas.test', token: 't' } as never
const s = (id: string, over: Partial<Session>): SessionEntry => ({
  key: `d1/${id}`,
  daemon,
  session: {
    id,
    name: id,
    runtime: 'claude-code',
    state: 'idle',
    needs_attention: false,
    updated_at: '2026-11-05T10:00:00Z',
    ...over,
  } as Session,
})
const entries = [
  s('a', { machine: 'nas', cwd: '/home/me/web', source: 'adopted', account: 'me@example.com' }),
  s('b', { machine: 'mac', cwd: '/Users/me/notes', source: 'remote_control', runtime: 'codex', account: 'work@example.com' }),
]
vi.mock('../hooks/use-session-entries', () => ({ useSessionEntries: () => ({ entries, daemons: [], loading: false }) }))

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}))

it('holds all the filter menu did: everything, devices and folders, agents, sources, accounts', async () => {
  const root = createRootRoute({ component: () => <SessionsNav replace /> })
  const router = createRouter({ routeTree: root, history: createMemoryHistory() })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
  const nav = await screen.findByRole('navigation', { name: 'Sessions' })
  for (const name of ['All sessions', 'nas', 'mac', 'web', 'notes'])
    expect(within(nav).getByRole('link', { name: new RegExp(name) })).toBeInTheDocument()
  for (const section of ['Devices', 'Agents', 'Sources', 'Accounts']) expect(within(nav).getByText(section)).toBeInTheDocument()
})
