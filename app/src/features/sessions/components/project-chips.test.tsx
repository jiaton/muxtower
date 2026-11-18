import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it, vi } from 'vitest'
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

function show(sessions: SessionEntry[], groups: ChipGroup[], chip?: string, listed = true) {
  // The daemon's list has come (or not: `listed`), which counts wait for.
  server.use(http.get(`${DAEMON_URL}/v1/sessions`, () => (listed ? HttpResponse.json([]) : new Promise(() => {}))))
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
  return router
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
  await waitFor(async () => expect(await labels()).toEqual(['g1', 'f1', 'e1', 'd1', 'c1', 'b1']), { timeout: 5000 }) // six, latest first, with counts
  expect(screen.getByRole('button', { name: 'New group' })).toBeInTheDocument()
})

it('before the first list has come, no counts: placeholders, never a "0"', async () => {
  show(entries, [], undefined, false)
  expect(await labels()).toEqual(['g', 'f', 'e', 'd', 'c', 'b'])
})

it('with groups: the groups in their order, counting the sessions they hold', async () => {
  show(entries, [
    { id: 'z', name: 'Last', projects: ['a'], sessions: [] },
    { id: 'f', name: 'Focus', projects: ['b', 'c', 'gone'], sessions: [] },
  ])
  await waitFor(async () => expect(await labels()).toEqual(['Last1', 'Focus2']), { timeout: 5000 })
})

it('scrolls the chosen chip into view', async () => {
  const at = (el: Element) => {
    const nav = el.closest('nav')?.firstElementChild
    const links = nav ? [...nav.querySelectorAll('a')] : []
    return links.indexOf(el as HTMLAnchorElement)
  }
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 300 })
  const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const i = at(this)
    return { left: i >= 0 ? i * 100 : 0, width: 90, top: 0, height: 32, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  })
  show(entries, [], 'p:b') // the sixth chip: at 500, past a row 300 wide
  const nav = await screen.findByRole('navigation', { name: 'Projects' })
  await waitFor(() => expect(nav.firstElementChild!.scrollLeft).toBe(500 - 150 + 45))
  rect.mockRestore()
})

function watchPut() {
  const put: string[][] = []
  server.use(
    http.put(`${DAEMON_URL}/v1/chip-groups`, async ({ request }) => {
      const body = (await request.json()) as { groups: ChipGroup[] }
      put.push(body.groups.map((g) => g.id))
      return HttpResponse.json(body)
    }),
  )
  return put
}

const three: ChipGroup[] = [
  { id: 'one', name: 'One', projects: ['a'], sessions: [] },
  { id: 'two', name: 'Two', projects: ['b'], sessions: [] },
  { id: 'three', name: 'Three', projects: ['c'], sessions: [] },
]

/** Chips 100 px apart, 90 wide, in the order they are drawn; the row from 0 to 300. */
function lineUp() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const holders = [...document.querySelectorAll('[data-chip-id]')]
    const i = holders.findIndex((h) => h === this || h.contains(this))
    const left = i >= 0 ? i * 100 : 0
    const width = i >= 0 ? 90 : 300
    return { left, width, right: left + width, top: 0, height: 32, bottom: 32, x: left, y: 0, toJSON: () => ({}) } as DOMRect
  })
}

it("a right click opens the chip's own menu, under it: its name, its teams, Edit, Delete (no Move)", async () => {
  show(entries, three)
  fireEvent.contextMenu(await screen.findByRole('link', { name: /One/ }))
  const menu = await screen.findByRole('menu')
  expect(within(menu).getByText('One')).toBeInTheDocument()
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent),
  ).toEqual(['Team · a', 'Edit', 'Delete'])
})

it('a chip dragged with the mouse lands where it is let go, and the order is saved', async () => {
  const put = watchPut()
  const rect = lineUp()
  const router = show(entries, three)
  const one = await screen.findByRole('link', { name: /One/ })
  fireEvent.pointerDown(one, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 10 })
  fireEvent.pointerMove(one, { pointerId: 1, pointerType: 'mouse', clientX: 170, clientY: 12 }) // past Two's middle
  await waitFor(async () => expect(await labels()).toEqual(['Two1', 'One1', 'Three1'])) // shown where it would land
  fireEvent.pointerUp(one, { pointerId: 1, pointerType: 'mouse', clientX: 170, clientY: 12 })
  fireEvent.click(one) // the click a drop makes chooses nothing
  await waitFor(() => expect(put).toEqual([['two', 'one', 'three']]))
  expect(router.state.location.search).not.toMatchObject({ chip: 'one' }) // not chosen by the drop
  rect.mockRestore()
})

it('a drag let go anywhere still lands (the chip moves in the row as it is dragged)', async () => {
  const put = watchPut()
  const rect = lineUp()
  show(entries, three)
  const three_ = await screen.findByRole('link', { name: /Three/ })
  fireEvent.pointerDown(three_, { button: 0, pointerId: 4, pointerType: 'mouse', clientX: 240, clientY: 10 })
  fireEvent.pointerMove(three_, { pointerId: 4, pointerType: 'mouse', clientX: 20, clientY: 10 })
  fireEvent.pointerUp(document.body, { pointerId: 4, pointerType: 'mouse', clientX: 20, clientY: 10 }) // not on the chip
  await waitFor(() => expect(put).toEqual([['three', 'one', 'two']]))
  rect.mockRestore()
})

it('a click that hardly moves still chooses the chip', async () => {
  const put = watchPut()
  const router = show(entries, three)
  const one = await screen.findByRole('link', { name: /One/ })
  fireEvent.pointerDown(one, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 10 })
  fireEvent.pointerMove(one, { pointerId: 1, pointerType: 'mouse', clientX: 43, clientY: 11 })
  fireEvent.pointerUp(one, { pointerId: 1, pointerType: 'mouse', clientX: 43, clientY: 11 })
  fireEvent.click(one)
  await waitFor(() => expect(router.state.location.search).toMatchObject({ chip: 'one' })) // chosen
  expect(put).toEqual([])
})

it('Alt+→ and Alt+← move a focused chip one place', async () => {
  const put = watchPut()
  show(entries, three)
  const two = await screen.findByRole('link', { name: /Two/ })
  fireEvent.keyDown(two, { key: 'ArrowRight', altKey: true })
  fireEvent.keyDown(two, { key: 'ArrowLeft', altKey: true })
  fireEvent.keyDown(two, { key: 'ArrowRight' }) // no Alt: nothing
  await waitFor(() =>
    expect(put).toEqual([
      ['one', 'three', 'two'],
      ['two', 'one', 'three'],
    ]),
  )
})

it('a finger moving at once scrolls the row; held first, it drags', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const put = watchPut()
  const rect = lineUp()
  show(entries, three)
  const one = await screen.findByRole('link', { name: /One/ })
  fireEvent.pointerDown(one, { button: 0, pointerId: 2, pointerType: 'touch', clientX: 40, clientY: 10 })
  fireEvent.pointerMove(one, { pointerId: 2, pointerType: 'touch', clientX: 120, clientY: 10 }) // a swipe
  vi.advanceTimersByTime(400)
  fireEvent.pointerUp(one, { pointerId: 2, pointerType: 'touch', clientX: 120, clientY: 10 })
  expect(put).toEqual([])
  fireEvent.pointerDown(one, { button: 0, pointerId: 3, pointerType: 'touch', clientX: 40, clientY: 10 })
  vi.advanceTimersByTime(350) // held: picked up
  fireEvent.pointerMove(one, { pointerId: 3, pointerType: 'touch', clientX: 260, clientY: 10 })
  fireEvent.pointerUp(one, { pointerId: 3, pointerType: 'touch', clientX: 260, clientY: 10 })
  await waitFor(() => expect(put).toEqual([['two', 'three', 'one']]))
  rect.mockRestore()
  vi.useRealTimers()
})

it('a group’s menu offers its teams, six then "More teams…", and one chosen shows its card', async () => {
  show(entries, [{ id: 'all', name: 'All', projects: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], sessions: [] }])
  fireEvent.contextMenu(await screen.findByRole('link', { name: /All/ }))
  const menu = await screen.findByRole('menu')
  const items = () =>
    within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent)
  expect(items()).toEqual(['Team · a', 'Team · b', 'Team · c', 'Team · d', 'Team · e', 'Team · f', 'More teams…', 'Edit', 'Delete'])
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'More teams…' }))
  expect(items()).toContain('Team · g')
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Team · c' }))
  const card = (await screen.findByText('c · 1 session')).closest('[role="menu"]') as HTMLElement
  expect(within(card).getByRole('menuitem', { name: 'Rename project…' })).toBeInTheDocument()
})

it('a group of single sessions offers the teams they are in', async () => {
  show(entries, [{ id: 'few', name: 'Few', projects: [], sessions: ['b', 'a', 'b'] }])
  fireEvent.contextMenu(await screen.findByRole('link', { name: /Few/ }))
  const menu = await screen.findByRole('menu')
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent)
      .slice(0, 2),
  ).toEqual(['Team · b', 'Team · a'])
})
