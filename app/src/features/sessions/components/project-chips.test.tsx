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
  server.use(http.get(`${DAEMON_URL}/v1/project-order`, () => HttpResponse.json({ projects: [] }))) // none set: by name
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

it("without groups: the projects in the owner's order (none set: by name), one chip each, then +", async () => {
  show(entries, [])
  // Six, in the stable order the list's groups follow (activity never moves them), with counts.
  await waitFor(async () => expect(await labels()).toEqual(['a1', 'b1', 'c1', 'd1', 'e1', 'f1']), { timeout: 5000 })
  expect(screen.getByRole('button', { name: 'New group' })).toBeInTheDocument()
})

it('before the first list has come, no counts: placeholders, never a "0"', async () => {
  show(entries, [], undefined, false)
  expect(await labels()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
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
    const nav = el.closest('nav')?.querySelector('[data-scroll-row]')
    const links = nav ? [...nav.querySelectorAll('a')] : []
    return links.indexOf(el as HTMLAnchorElement)
  }
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 300 })
  const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const i = at(this)
    return { left: i >= 0 ? i * 100 : 0, width: 90, top: 0, height: 32, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  })
  show(entries, [], 'p:f') // the sixth chip: at 500, past a row 300 wide
  const nav = await screen.findByRole('navigation', { name: 'Projects' })
  await waitFor(() => expect(nav.querySelector('[data-scroll-row]')!.scrollLeft).toBe(500 - 150 + 45))
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

it('a chip dragged with the mouse lands where it is let go, the order saved, and the drop chooses nothing', async () => {
  const put = watchPut()
  const rect = lineUp()
  const router = show(entries, three)
  const one = await screen.findByRole('link', { name: /One/ })
  fireEvent.mouseDown(one, { button: 0, clientX: 40, clientY: 10 })
  fireEvent.mouseMove(document, { clientX: 60, clientY: 10 }) // past the few pixels: lifted
  fireEvent.mouseMove(document, { clientX: 120, clientY: 10 }) // mostly over Two
  fireEvent.mouseUp(document, { clientX: 120, clientY: 10 })
  fireEvent.click(one)
  await waitFor(() => expect(put).toEqual([['two', 'one', 'three']]), { timeout: 5000 })
  expect(router.state.location.search).not.toMatchObject({ chip: 'one' })
  rect.mockRestore()
})

// What the row does with a click that hardly moved: nothing, the link has it (in a browser it chooses the
// chip). Checked where the row would stop it: the click reaches the link not cancelled (a listener on the link
// itself runs after the row's capture handler, before the router's own); the router's navigating on it is
// not waited for here (a CI runner twice never saw it, never reproduced).
it('a mouse’s wheel scrolls the row, and a chip dragged after it still lands where it is let go; drag takes no wheel', async () => {
  const put = watchPut()
  const rect = lineUp()
  show(entries, three)
  const one = await screen.findByRole('link', { name: /One/ })
  const row = one.closest<HTMLElement>('[data-scroll-row]')!
  const wheel = (deltaY: number) => {
    const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
    one.dispatchEvent(e)
    return e.defaultPrevented
  }
  expect(wheel(30)).toBe(false) // fits (jsdom lays nothing out): the page's, even with the drag code there
  let left = 0
  Object.defineProperty(row, 'clientWidth', { configurable: true, get: () => 300 })
  Object.defineProperty(row, 'scrollWidth', { configurable: true, get: () => 500 })
  Object.defineProperty(row, 'scrollLeft', { configurable: true, get: () => left, set: (v: number) => (left = v) })
  expect(wheel(30)).toBe(true)
  expect(left).toBe(30)
  fireEvent.mouseDown(one, { button: 0, clientX: 40, clientY: 10 })
  fireEvent.mouseMove(document, { clientX: 60, clientY: 10 })
  expect(wheel(30)).toBe(true) // a wheel while lifted: still the row's own scroll, nothing of the drag's
  fireEvent.mouseMove(document, { clientX: 120, clientY: 10 })
  fireEvent.mouseUp(document, { clientX: 120, clientY: 10 })
  await waitFor(() => expect(put).toEqual([['two', 'one', 'three']]), { timeout: 5000 })
  rect.mockRestore()
  await new Promise((r) => setTimeout(r, 60)) // dnd-kit swallows clicks until 50 ms after a drop: not the next test's
})

it('a click that hardly moves is no drag: the row leaves the click to the link', async () => {
  const put = watchPut()
  show(entries, three)
  await screen.findByRole('link', { name: /One/ })
  // Looked up again for each step: a render as the list settles may put a new link in its place (a CI
  // runner did, three times: the old one, detached, never navigated).
  const one = () => screen.getByRole('link', { name: /One/ })
  fireEvent.mouseDown(one(), { button: 0, clientX: 40, clientY: 10 })
  fireEvent.mouseMove(document, { clientX: 43, clientY: 11 })
  fireEvent.mouseUp(document, { clientX: 43, clientY: 11 })
  const link = one()
  let cancelled: boolean | null = null
  link.addEventListener('click', (e) => (cancelled = e.defaultPrevented))
  fireEvent.click(link)
  expect(cancelled).toBe(false)
  expect(document.body.textContent).not.toMatch(/Picked up/) // never lifted
  expect(put).toEqual([])
})

// The arrows' moves need real layout (dnd-kit measures it): checked in a browser. Here: Space lifts it, said
// to screen readers, and Escape puts it back as it was.
it('by keyboard: Space lifts it (announced), Escape puts it back unchanged', async () => {
  const put = watchPut()
  show(entries, three)
  const one = await screen.findByRole('link', { name: /One/ })
  expect(one).toHaveAttribute('aria-roledescription', 'sortable')
  one.focus()
  fireEvent.keyDown(one, { code: 'Space', key: ' ' })
  await waitFor(() => expect(document.body.textContent).toMatch(/Picked up draggable item one/))
  fireEvent.keyDown(one, { code: 'Escape', key: 'Escape' })
  await waitFor(() => expect(document.body.textContent).toMatch(/Dragging was cancelled/))
  expect(put).toEqual([])
})

it('Alt+→ and Alt+← move a focused chip one place; Enter still chooses it', async () => {
  const put = watchPut()
  show(entries, three)
  const two = await screen.findByRole('link', { name: /Two/ })
  fireEvent.keyDown(two, { key: 'ArrowRight', code: 'ArrowRight', altKey: true })
  fireEvent.keyDown(two, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true })
  fireEvent.keyDown(two, { key: 'ArrowRight', code: 'ArrowRight' }) // no Alt, not lifted: nothing
  await waitFor(() =>
    expect(put).toEqual([
      ['one', 'three', 'two'],
      ['two', 'one', 'three'],
    ]),
  )
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

it('slides the others aside as a chip moves, unless the reader asked for less motion', async () => {
  const dragTwo = async () => {
    const rect = lineUp()
    show(entries, three)
    const one = await screen.findByRole('link', { name: /One/ })
    fireEvent.mouseDown(one, { button: 0, clientX: 40, clientY: 10 })
    fireEvent.mouseMove(document, { clientX: 60, clientY: 10 })
    fireEvent.mouseMove(document, { clientX: 120, clientY: 10 })
    await new Promise((r) => setTimeout(r, 50))
    const two = document.querySelector<HTMLElement>('[data-chip-id="two"]')!
    const style = { transition: two.style.transition, transform: two.style.transform }
    fireEvent.mouseUp(document, { clientX: 120, clientY: 10 })
    rect.mockRestore()
    return style
  }
  watchPut()
  const moving = await dragTwo()
  expect(moving.transition).toMatch(/transform/)
  document.body.innerHTML = ''
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
  const still = await dragTwo()
  expect(still.transition).toBe('')
  vi.unstubAllGlobals()
})

it('Edit: a held project no session has shows "No sessions"; Remove takes it out of the group and saves it', async () => {
  const saved: ChipGroup[][] = []
  server.use(
    http.put(`${DAEMON_URL}/v1/chip-groups`, async ({ request }) => {
      const body = (await request.json()) as { groups: ChipGroup[] }
      saved.push(body.groups)
      return HttpResponse.json(body)
    }),
  )
  show(entries, [{ id: 'f', name: 'Focus', projects: ['b', 'acme/old'], sessions: [] }, ...three])
  fireEvent.contextMenu(await screen.findByRole('link', { name: /Focus/ }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('No sessions')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove acme/old from the group' }))
  await waitFor(() => expect(saved).toHaveLength(1))
  expect(saved[0].map((g) => [g.id, g.projects])).toEqual([
    ['f', ['b']],
    ['one', ['a']],
    ['two', ['b']],
    ['three', ['c']],
  ])
  expect(within(dialog).queryByText('acme/old')).toBeNull() // gone from the dialog, which stays open
  expect(within(dialog).getByRole('textbox', { name: 'Group name' })).toHaveValue('Focus')
})
