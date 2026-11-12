import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { wrapper } from '@/test/render'
import type { SessionEntry } from '../model/facets'
import { foldForks } from '../model/forks'
import { useListPrefs } from '../store'
import { SessionList } from './session-list'

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const entry = (id: string, name: string, forkOf?: string): SessionEntry => ({
  key: `d1/${id}`,
  daemon,
  session: {
    id, name, runtime: 'claude-code', cwd: '/home/me/web', source: 'remote_control', machine: 'hub', state: 'idle',
    needs_attention: false, notify: 'all', capabilities: {}, updated_at: '2026-10-25T10:00:00Z', fork_of: forkOf ?? null,
    side_chat: false,
  } as unknown as Session,
}) // prettier-ignore

beforeEach(() => useListPrefs.setState({ collapsed: [] }))

/** Plan the launch › (Draft the post › Polish the post, Check the budget); then Weekly notes on its own. */
async function renderTree() {
  const { shown, forks } = foldForks([
    entry('plan', 'Plan the launch'),
    entry('draft', 'Draft the post', 'plan'),
    entry('polish', 'Polish the post', 'draft'),
    entry('budget', 'Check the budget', 'plan'),
    entry('notes', 'Weekly notes'),
  ])
  const implies = { device: false, folder: false, source: false, account: false, agent: false }
  const groups = [{ key: 'all', label: 'All', implies, entries: shown }]
  const root = createRootRoute({ component: () => <SessionList groups={groups} held={{ forks }} /> })
  const router = createRouter({ routeTree: root, history: createMemoryHistory() })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
  await screen.findByText('Polish the post')
}

const rowOf = (name: string) => screen.getByText(name).closest('[data-row]') as HTMLElement
const joins = (name: string) => [...rowOf(name).querySelectorAll('[data-join]')].map((e) => e.getAttribute('data-join'))
const railsAt = (name: string) =>
  [...rowOf(name).querySelectorAll(':scope > span[aria-hidden].top-0.bottom-0')].map((e) => (e as HTMLElement).style.left)

it('joins forks to one rail: ├ for those with more below, └ for the last, the rail going on past a subtree', async () => {
  await renderTree()
  expect(rowOf('Plan the launch').querySelector('[data-rail="forks"]')).not.toBeNull() // down from under its icon
  expect(joins('Plan the launch')).toEqual([])
  expect(joins('Draft the post')).toEqual(['more']) // ├: Check the budget comes after its own fork
  expect(rowOf('Draft the post').querySelector('[data-rail="forks"]')).not.toBeNull()
  expect(joins('Polish the post')).toEqual(['last']) // └ to Draft the post's rail
  expect(railsAt('Polish the post')).toHaveLength(1) // Plan the launch's rail goes on past it, to Check the budget
  expect(joins('Check the budget')).toEqual(['last'])
  expect(railsAt('Check the budget')).toEqual([])
  expect(rowOf('Weekly notes').querySelector('[data-rail], [data-join]')).toBeNull()
})

it('draws no rail under a row whose forks are folded away', async () => {
  await renderTree()
  const toggle = screen.getAllByRole('button', { name: /1 fork|2 forks/ })[0]!
  act(() => {
    fireEvent.click(toggle)
  })
  expect(screen.queryByText('Draft the post')).toBeNull()
  expect(rowOf('Plan the launch').querySelector('[data-rail="forks"]')).toBeNull()
})
