import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import type { SessionEntry } from '@/features/sessions/model/facets'
import { groupEntries } from '@/features/sessions/model/query'
import { SessionHeader } from '@/features/sessions/components/session-header'
import { SessionList } from '@/features/sessions/components/session-list'
import { SessionsNav } from '@/features/sessions/components/sessions-nav'
import { useListPrefs } from '@/features/sessions/store'
import { usePalette } from '../store'
import { PaletteHost } from './palette-host'

// A project's colour in all four places it shows: the list's group header (a dot), the sidebar's Projects (a
// dot), the session header's project tag and ⌘K's (tinted); picked in the group header's ⋯ menu.

const session = (id: string, project: string): Session =>
  ({
    id, name: `Session ${id}`, runtime: 'claude-code', cwd: `/home/me/${id}`, project, project_source: 'set',
    source: 'launched', machine: 'build-box', on_host: true, state: 'idle', needs_attention: false,
    created_at: '2026-11-01T08:00:00Z', updated_at: '2026-11-05T10:00:00Z', capabilities: {},
  }) as unknown as Session // prettier-ignore
const sessions = [session('web-1', 'acme/web'), session('api-1', 'acme/api')]
let entries: SessionEntry[] = []
vi.mock('@/features/sessions/hooks/use-session-entries', () => ({ useSessionEntries: () => ({ entries, daemons: [], loading: false }) }))
vi.mock('@/features/sessions/components/session-list-row', () => ({
  SessionListRow: ({ entry }: { entry: SessionEntry }) => <span>{entry.session.name}</span>,
}))

let stored: Record<string, number> = {}
let puts: unknown[] = []
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const daemon = addDaemon()
  entries = sessions.map((s) => ({ key: `${daemon.id}/${s.id}`, daemon, session: s }))
  useListPrefs.setState({ collapsed: [] })
  stored = { 'acme/web': 2 } // acme/api has none yet
  puts = []
  server.use(
    http.get(`${DAEMON_URL}/v1/usage`, () => HttpResponse.json([])),
    http.get(`${DAEMON_URL}/v1/nodes`, () => HttpResponse.json([])),
    http.get(`${DAEMON_URL}/v1/project-order`, () => HttpResponse.json({ projects: [] })),
    http.get(`${DAEMON_URL}/v1/project-colours`, () => HttpResponse.json({ hues: stored })),
    http.put(`${DAEMON_URL}/v1/project-colours`, async ({ request }) => {
      const body = (await request.json()) as { project: string; hue: number }
      puts.push(body)
      stored = { ...stored, [body.project]: body.hue }
      return HttpResponse.json({ hues: stored })
    }),
  )
})
afterEach(() => act(() => usePalette.getState().setOpen(false)))

/** ⌘K, searching for the sessions (with nothing typed it lists the recent and the waiting only). */
function openPalette() {
  fireEvent.keyDown(window, { code: 'KeyK', key: 'k', ctrlKey: true })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Session' } })
}

function show() {
  const root = createRootRoute({
    component: () => (
      <>
        <SessionsNav />
        <SessionList groups={groupEntries(entries, 'project')} foldScope="project" ordering={{ stored: [], save: () => {} }} />
        <SessionHeader daemonId={entries[0]!.daemon.id} session={sessions[0]!} />
        <PaletteHost />
      </>
    ),
  })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={createRouter({ routeTree: root, history: createMemoryHistory() })} />
    </Wrapper>,
  )
}

/** The hue each of the four places shows for acme/web (null: neutral). */
function shown() {
  const hueIn = (el: Element | null | undefined) => el?.querySelector('[data-hue]')?.getAttribute('data-hue') ?? null
  // The list, the sidebar and the header sit behind the open palette (hidden from it).
  const header = screen.getAllByRole('heading', { level: 3, hidden: true }).find((h) => h.textContent?.startsWith('acme/web'))
  const nav = [...document.querySelectorAll('nav[aria-label="Sessions"] a')].find((a) => a.textContent?.includes('acme/web'))
  const tag = document.querySelector('h1')?.closest('header')?.querySelector('[data-tag="project"]')
  const palette = within(screen.getByRole('listbox')).getByText('Session web-1').closest('[role="option"]')
  return {
    group: hueIn(header),
    sidebar: hueIn(nav),
    tag: tag?.getAttribute('data-hue') ?? null,
    palette: palette?.querySelector('[data-tag="project"]')?.getAttribute('data-hue') ?? null,
  }
}

it("shows each project's stored hue in all four places, neutral where none is stored; a pick in the ⋯ menu shows everywhere", async () => {
  show()
  await screen.findByRole('navigation', { name: 'Sessions' })
  openPalette()
  await waitFor(() => expect(shown()).toEqual({ group: '2', sidebar: '2', tag: '2', palette: '2' }))

  // acme/api has none yet: its header shows the plain project icon, its sidebar item too, its ⌘K tag neutral.
  const api = screen.getAllByRole('heading', { level: 3, hidden: true }).find((h) => h.textContent?.startsWith('acme/api'))!
  expect(api.querySelector('[data-hue]')).toBeNull()
  const apiTag = within(screen.getByRole('listbox')).getByText('acme/api')
  expect(apiTag).toHaveAttribute('data-tag', 'project')
  expect(apiTag).not.toHaveAttribute('data-hue')

  act(() => usePalette.getState().setOpen(false))
  fireEvent.keyDown(screen.getByRole('button', { name: 'More for acme/web' }), { key: 'Enter' })
  const menu = await screen.findByRole('menu')
  expect(within(menu).getByRole('menuitemradio', { name: 'Teal' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Moss' }))
  await waitFor(() => expect(puts).toEqual([{ project: 'acme/web', hue: 5 }]))

  openPalette()
  await waitFor(() => expect(shown()).toEqual({ group: '5', sidebar: '5', tag: '5', palette: '5' }))
}, 15_000)
