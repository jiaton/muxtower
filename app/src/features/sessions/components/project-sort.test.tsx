import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { useProjectOrder, useSaveProjectOrder } from '../api/use-project-order'
import type { SessionEntry } from '../model/facets'
import { groupEntries } from '../model/query'
import { useListPrefs } from '../store'
import { SessionList } from './session-list'

vi.mock('./session-list-row', () => ({
  SessionListRow: ({ entry }: { entry: SessionEntry }) => <a href={`#${entry.key}`}>{entry.session.name}</a>,
}))

let made = 0
const entry = (id: string, project: string, over: Partial<Session> = {}): SessionEntry => ({
  key: `d1/${id}`,
  daemon: { id: 'd1', name: 'hub', url: DAEMON_URL, token: 't' },
  session: {
    id, name: id, runtime: 'claude-code', cwd: `/home/me/${project}`, project, project_source: 'set', source: 'launched',
    machine: 'build-box', on_host: true, state: 'idle', needs_attention: false,
    created_at: new Date(Date.UTC(2026, 10, 1, 0, made++)).toISOString(), updated_at: '2026-11-05T10:00:00Z', ...over,
  } as Session, // prettier-ignore
})
const sessions = [
  entry('web-1', 'acme/web'),
  entry('api-1', 'acme/api'),
  entry('shop-1', 'acme/shop'),
  entry('loose', 'x', { cwd: '/home/me', project: null }),
]

/** The list grouped by project, its order read from and kept on the (mocked) hub, as the route wires it. */
function Harness({ entries }: { entries: SessionEntry[] }) {
  const order = useProjectOrder()
  const save = useSaveProjectOrder()
  return (
    <SessionList
      groups={groupEntries(entries, 'project', order)}
      foldScope="project"
      ordering={{ stored: order, save: (projects) => save.mutate(projects) }}
    />
  )
}

let stored: string[] = []
let puts: string[][] = []
beforeEach(() => {
  stored = []
  puts = []
  useListPrefs.setState({ collapsed: [] })
  addDaemon()
  server.use(
    http.get(`${DAEMON_URL}/v1/project-order`, () => HttpResponse.json({ projects: stored })),
    http.put(`${DAEMON_URL}/v1/project-order`, async ({ request }) => {
      stored = ((await request.json()) as { projects: string[] }).projects
      puts.push(stored)
      return HttpResponse.json({ projects: stored })
    }),
  )
})
afterEach(() => vi.restoreAllMocks())

const headers = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.replace(/\d+$/, ''))

/** Each group 100 px tall, stacked in the order drawn (dnd-kit measures them). */
function stack() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const groups = [...document.querySelectorAll('section[aria-label]')].filter((s) => !s.parentElement?.closest('section'))
    const i = groups.findIndex((g) => g === this || g.contains(this))
    const top = Math.max(0, i) * 100
    return { left: 0, width: 300, right: 300, top, height: 100, bottom: top + 100, x: 0, y: top, toJSON: () => ({}) } as DOMRect
  })
}

it('shows the projects by name until put in order; Move down and Move up keep the order on the hub', async () => {
  render(<Harness entries={sessions} />, { wrapper: wrapper() })
  await waitFor(() => expect(headers()).toEqual(['acme/api', 'acme/shop', 'acme/web', 'Other']))
  fireEvent.keyDown(screen.getByRole('button', { name: 'More for acme/api' }), { key: 'Enter' })
  const menu = await screen.findByRole('menu')
  expect(within(menu).getByRole('menuitem', { name: 'Move up' })).toHaveAttribute('aria-disabled', 'true') // first
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move down' }))
  await waitFor(() => expect(puts).toEqual([['acme/shop', 'acme/api', 'acme/web']]))
  await waitFor(() => expect(headers()).toEqual(['acme/shop', 'acme/api', 'acme/web', 'Other']))

  fireEvent.keyDown(screen.getByRole('button', { name: 'More for acme/web' }), { key: 'Enter' })
  const again = await screen.findByRole('menu')
  expect(within(again).getByRole('menuitem', { name: 'Move down' })).toHaveAttribute('aria-disabled', 'true') // last
  fireEvent.click(within(again).getByRole('menuitem', { name: 'Move up' }))
  await waitFor(() => expect(puts.at(-1)).toEqual(['acme/shop', 'acme/web', 'acme/api']))
  await waitFor(() => expect(headers()).toEqual(['acme/shop', 'acme/web', 'acme/api', 'Other']))
}, 15_000) // two menus opened: slow on a busy runner

it('only projects are put in order: Other and folder groups have no handle and no menu', async () => {
  render(<Harness entries={sessions} />, { wrapper: wrapper() })
  await screen.findByRole('button', { name: 'Move acme/api' })
  expect(screen.getAllByRole('button', { name: /^Move / }).map((b) => b.getAttribute('aria-label'))).toEqual([
    'Move acme/api',
    'Move acme/shop',
    'Move acme/web',
  ])
  expect(screen.queryByRole('button', { name: 'More for Other' })).toBeNull()
})

it('a project dragged by its handle with the mouse lands where it is let go, and the drop folds nothing', async () => {
  const rect = stack()
  render(<Harness entries={sessions} />, { wrapper: wrapper() })
  const handle = await screen.findByRole('button', { name: 'Move acme/api' })
  fireEvent.mouseDown(handle, { button: 0, clientX: 5, clientY: 10 })
  fireEvent.mouseMove(document, { clientX: 5, clientY: 20 }) // past a few pixels: lifted
  fireEvent.mouseMove(document, { clientX: 5, clientY: 160 })
  fireEvent.mouseMove(document, { clientX: 5, clientY: 220 }) // over acme/web
  fireEvent.mouseUp(document, { clientX: 5, clientY: 220 })
  await waitFor(() => expect(puts).toEqual([['acme/shop', 'acme/web', 'acme/api']]), { timeout: 5000 })
  expect(useListPrefs.getState().collapsed).toEqual([])
  rect.mockRestore()
})

it('a click on the handle without moving is no drag, and a header still folds on a click', async () => {
  render(<Harness entries={sessions} />, { wrapper: wrapper() })
  const handle = await screen.findByRole('button', { name: 'Move acme/api' })
  fireEvent.mouseDown(handle, { button: 0, clientX: 5, clientY: 10 })
  fireEvent.mouseUp(document, { clientX: 6, clientY: 11 })
  expect(document.body.textContent).not.toMatch(/Picked up/)
  fireEvent.click(screen.getByRole('button', { name: /^acme\/api/, expanded: true }))
  expect(useListPrefs.getState().collapsed).toHaveLength(1)
  expect(puts).toEqual([])
})

it('by keyboard: Space lifts it (announced by name), the arrows move it, Space puts it down and keeps it', async () => {
  const rect = stack()
  render(<Harness entries={sessions} />, { wrapper: wrapper() })
  const handle = await screen.findByRole('button', { name: 'Move acme/api' })
  expect(handle).toHaveAttribute('aria-roledescription', 'sortable')
  handle.focus()
  fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
  await waitFor(() => expect(document.body.textContent).toMatch(/Picked up acme\/api, project 1 of 3/))
  fireEvent.keyDown(handle, { code: 'ArrowDown', key: 'ArrowDown' })
  await waitFor(() => expect(document.body.textContent).toMatch(/acme\/api moved to place 2 of 3/))
  fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
  await waitFor(() => expect(puts).toEqual([['acme/shop', 'acme/api', 'acme/web']]))
  rect.mockRestore()
})

it('Escape puts a lifted project back unchanged', async () => {
  render(<Harness entries={sessions} />, { wrapper: wrapper() })
  const handle = await screen.findByRole('button', { name: 'Move acme/web' })
  handle.focus()
  fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
  await waitFor(() => expect(document.body.textContent).toMatch(/Picked up acme\/web/))
  fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' })
  await waitFor(() => expect(document.body.textContent).toMatch(/acme\/web put back where it was/))
  expect(puts).toEqual([])
})

it('a finger that moves on a header before the hold is a scroll: nothing is lifted', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    render(<Harness entries={sessions} />, { wrapper: wrapper() })
    const header = await screen.findByRole('button', { name: /^acme\/api/, expanded: true })
    fireEvent.touchStart(header, { touches: [{ clientX: 50, clientY: 50 }] })
    fireEvent.touchMove(header, { touches: [{ clientX: 50, clientY: 90 }] }) // a swipe up the list
    vi.advanceTimersByTime(600)
    fireEvent.touchEnd(header, { touches: [], changedTouches: [{ clientX: 50, clientY: 90 }] })
    expect(document.body.textContent).not.toMatch(/Picked up/)
    expect(puts).toEqual([])
  } finally {
    vi.useRealTimers()
  }
})

it('a finger held still on a header picks the project up', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const rect = stack()
  try {
    render(<Harness entries={sessions} />, { wrapper: wrapper() })
    const header = await screen.findByRole('button', { name: /^acme\/api/, expanded: true })
    fireEvent.touchStart(header, { touches: [{ clientX: 50, clientY: 50 }] })
    vi.advanceTimersByTime(400)
    await waitFor(() => expect(document.body.textContent).toMatch(/Picked up acme\/api/))
    fireEvent.touchEnd(header, { touches: [], changedTouches: [{ clientX: 50, clientY: 50 }] })
  } finally {
    rect.mockRestore()
    vi.useRealTimers()
  }
})
