import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { useLayoutPrefs } from '@/lib/layout-prefs'
import { usePalette } from '../store'
import { PaletteHost } from './palette-host'

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
afterEach(() => act(() => usePalette.getState().setOpen(false)))

function show() {
  addDaemon()
  const root = createRootRoute({
    component: () => (
      <>
        <input aria-label="Elsewhere" />
        <PaletteHost />
      </>
    ),
  })
  const router = createRouter({ routeTree: root, history: createMemoryHistory() })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
}

it('Ctrl+K (⌘K on a Mac) opens it from anywhere, again closes it; Cmd+F is left to the browser', async () => {
  show()
  const field = await screen.findByRole('textbox', { name: 'Elsewhere' })
  fireEvent.keyDown(field, { code: 'KeyF', key: 'f', ctrlKey: true })
  expect(screen.queryByRole('combobox')).toBeNull()
  fireEvent.keyDown(field, { code: 'KeyK', key: 'k', ctrlKey: true }) // even from a text field
  expect(screen.getByRole('combobox', { name: 'Go to a session or a command' })).toBeInTheDocument()
  fireEvent.keyDown(window, { code: 'KeyK', key: 'k', ctrlKey: true })
  expect(screen.queryByRole('combobox')).toBeNull()
})

it('"/" opens it outside a text field only', async () => {
  show()
  const field = await screen.findByRole('textbox', { name: 'Elsewhere' })
  field.focus()
  fireEvent.keyDown(field, { key: '/' })
  expect(screen.queryByRole('combobox')).toBeNull() // typed there
  field.blur()
  fireEvent.keyDown(document.body, { key: '/' })
  expect(screen.getByRole('combobox')).toBeInTheDocument()
})

it('runs a command picked by name, and shows its key', async () => {
  useLayoutPrefs.setState({ layout: 'full', previous: 'full' })
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} })) // wide
  show()
  await screen.findByRole('textbox', { name: 'Elsewhere' })
  fireEvent.keyDown(window, { code: 'KeyK', key: 'k', ctrlKey: true })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'session only' } })
  const item = screen.getByRole('option', { name: /^Session only/ })
  expect(item).toHaveTextContent('Alt')
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
  expect(useLayoutPrefs.getState().layout).toBe('session')
  expect(screen.queryByRole('combobox')).toBeNull()
  // Again: back to the layout before it.
  fireEvent.keyDown(window, { code: 'KeyK', key: 'k', ctrlKey: true })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'leave session only' } })
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
  expect(useLayoutPrefs.getState().layout).toBe('full')
})

it('offers the layouts this screen can show: three where the sidebar docks, two below, none on a phone', async () => {
  const layouts = () => screen.queryAllByRole('option', { name: /^Layout: / }).map((o) => o.textContent)
  const widths = { dock: true, split: true }
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('64rem') ? widths.dock : q.includes('48rem') ? widths.split : false,
    addEventListener() {},
    removeEventListener() {},
  }))
  show()
  await screen.findByRole('textbox', { name: 'Elsewhere' })
  const open = (q: string) => {
    fireEvent.keyDown(window, { code: 'KeyK', key: 'k', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: q } })
  }
  open('layout')
  expect(layouts()).toEqual(['Layout: Sidebar, list and session', 'Layout: List and session', 'Layout: Session only'])
  fireEvent.click(screen.getByRole('option', { name: 'Layout: List and session' }))
  expect(useLayoutPrefs.getState().layout).toBe('list')
  widths.dock = false // a Fold
  open('layout')
  expect(layouts()).toEqual(['Layout: List and session', 'Layout: Session only'])
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
  widths.split = false // a phone
  open('layout')
  expect(layouts()).toEqual([])
  expect(screen.queryByRole('option', { name: /Session only/ })).toBeNull()
  useLayoutPrefs.setState({ layout: 'full' })
})

it('searches inside conversations once typing pauses, says a late node is still searching, and goes to a hit', async () => {
  const { http, HttpResponse } = await import('msw')
  const { server, DAEMON_URL } = await import('@/test/server')
  const { useJump } = await import('@/features/conversation/jump')
  const asked: string[] = []
  const hit = (sid: string, node: string | null) => ({
    session_id: sid, seq: 4096, at: null, role: 'agent', archived: false, node,
    snippet: [{ text: 'use the ', match: false }, { text: 'chart', match: true }, { text: ' library', match: false }],
  }) // prettier-ignore
  server.use(
    http.get(`${DAEMON_URL}/v1/search`, ({ request }) => {
      const url = new URL(request.url)
      asked.push(`${url.searchParams.get('q')}${url.searchParams.get('node') ? `@${url.searchParams.get('node')}` : ''}`)
      if (url.searchParams.get('node') === 'mac') return HttpResponse.json({ hits: [hit('mac~m1', 'mac')], late: [], off: false })
      return HttpResponse.json({ hits: [hit('s1', null)], late: ['mac'], off: false })
    }),
  )
  show()
  await screen.findByRole('textbox', { name: 'Elsewhere' })
  fireEvent.keyDown(window, { code: 'KeyK', key: 'k', ctrlKey: true })
  const box = screen.getByRole('combobox')
  fireEvent.change(box, { target: { value: 'c' } })
  fireEvent.change(box, { target: { value: 'chart' } }) // typed on: one question, for all of it
  await new Promise((r) => setTimeout(r, 400)) // the debounce, and the answer
  const found = await screen.findAllByRole('option', { name: /chart library/ })
  expect(found.length).toBeGreaterThan(0)
  expect(asked[0]).toBe('chart')
  expect(asked.filter((q) => q === 'chart')).toHaveLength(1)
  await screen.findByRole('option', { name: /mac~m1/ }) // the late node, asked on its own
  expect(asked).toContain('chart@mac')
  fireEvent.click(found[0]!)
  expect(useJump.getState().to?.seq).toBe(4096)
})
