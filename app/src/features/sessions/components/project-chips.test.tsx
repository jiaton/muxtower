import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import type { ChipGroup } from '../model/chip-groups'
import type { SessionEntry } from '../model/facets'
import { ProjectChips } from './project-chips'

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const entry = (id: string, project: string, minute: number): SessionEntry => ({
  key: `d1/${id}`,
  daemon,
  session: {
    id, name: id, runtime: 'claude-code', cwd: `/home/me/${project}`, project, project_source: 'set', source: 'adopted',
    machine: 'hub', state: 'idle', needs_attention: false, updated_at: `2026-11-05T10:${String(minute).padStart(2, '0')}:00Z`,
  } as Session, // prettier-ignore
})
const entries = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((p, i) => entry(p, p, i))

function show(sessions: SessionEntry[], groups: ChipGroup[], chip?: string) {
  addDaemon()
  const root = createRootRoute({
    component: () => <ProjectChips query={{ view: 'all', group: 'status' }} search={{ chip }} entries={sessions} groups={groups} />,
  })
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: [chip ? `/?chip=${chip}` : '/'] }) })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
}

const labels = async () =>
  within(await screen.findByRole('navigation', { name: 'Projects' }))
    .getAllByRole('link')
    .map((l) => l.textContent)

afterEach(() => {
  for (const key of ['offsetLeft', 'offsetWidth', 'clientWidth'] as const)
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key]
})

it('is not shown for a single project and no groups', async () => {
  show([entry('a', 'muxtower', 1), entry('b', 'muxtower', 2)], [])
  await new Promise((r) => setTimeout(r, 50))
  expect(screen.queryByRole('navigation', { name: 'Projects' })).toBeNull()
})

it('without groups: the most recently active projects, one chip each, then +', async () => {
  show(entries, [])
  expect(await labels()).toEqual(['g1', 'f1', 'e1', 'd1', 'c1', 'b1']) // six, latest first, with counts
  expect(screen.getByRole('button', { name: 'New group' })).toBeInTheDocument()
})

it('with groups: the groups in their order, counting the sessions they hold', async () => {
  show(entries, [
    { id: 'z', name: 'Last', projects: ['a'] },
    { id: 'f', name: 'Focus', projects: ['b', 'c', 'gone'] },
  ])
  expect(await labels()).toEqual(['Last1', 'Focus2'])
})

it('scrolls the chosen chip into view', async () => {
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get() {
      return this.parentElement ? [...this.parentElement.children].indexOf(this) * 100 : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 90 })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 300 })
  show(entries, [], 'p:b') // the sixth chip: at 500, past a row 300 wide
  const nav = await screen.findByRole('navigation', { name: 'Projects' })
  await waitFor(() => expect(nav.firstElementChild!.scrollLeft).toBe(500 - 150 + 45))
})

it('a right click on a group offers Edit, Move and Delete; Move right puts the new order', async () => {
  const put: unknown[] = []
  server.use(
    http.put(`${DAEMON_URL}/v1/chip-groups`, async ({ request }) => {
      const body = (await request.json()) as { groups: ChipGroup[] }
      put.push(body.groups.map((g) => g.id))
      return HttpResponse.json(body)
    }),
  )
  show(entries, [
    { id: 'one', name: 'One', projects: ['a'] },
    { id: 'two', name: 'Two', projects: ['b'] },
  ])
  fireEvent.contextMenu(await screen.findByRole('link', { name: /One/ }))
  const menu = await screen.findByRole('menu')
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent),
  ).toEqual(['Edit', 'Move right', 'Delete'])
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move right' }))
  await waitFor(() => expect(put).toEqual([['two', 'one']]))
})
