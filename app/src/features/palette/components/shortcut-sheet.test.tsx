import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Segmented } from '@/components/ui/segmented'
import { addDaemon, wrapper } from '@/test/render'
import { capsOf, SHORTCUTS, withKeys } from '@/lib/shortcuts'
import { usePalette, useShortcutSheet } from '../store'
import { PaletteHost } from './palette-host'

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
afterEach(() => {
  act(() => {
    usePalette.getState().setOpen(false)
    useShortcutSheet.getState().setOpen(false)
  })
  vi.unstubAllGlobals()
})

function show() {
  addDaemon()
  const root = createRootRoute({
    component: () => (
      <>
        <input aria-label="Elsewhere" />
        <div tabIndex={0} data-own-keys aria-label="Session output" role="log" />
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

const sheet = () => screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })

it('"?" opens the sheet outside a text field and the terminal', async () => {
  show()
  const field = await screen.findByRole('textbox', { name: 'Elsewhere' })
  field.focus()
  fireEvent.keyDown(field, { key: '?', code: 'Slash', shiftKey: true })
  expect(sheet()).toBeNull()
  const log = screen.getByRole('log')
  log.focus()
  fireEvent.keyDown(log, { key: '?', code: 'Slash', shiftKey: true })
  expect(sheet()).toBeNull()
  log.blur()
  fireEvent.keyDown(document.body, { key: '/', code: 'Slash' }) // "/" is the palette's
  expect(sheet()).toBeNull()
  act(() => usePalette.getState().setOpen(false))
  fireEvent.keyDown(document.body, { key: '?', code: 'Slash', shiftKey: true })
  expect(sheet()).toBeInTheDocument()
})

it('lists every shortcut of the registry, by area, with its keys', async () => {
  show()
  await screen.findByRole('textbox', { name: 'Elsewhere' })
  fireEvent.keyDown(document.body, { key: '?', code: 'Slash', shiftKey: true })
  const dialog = sheet()!
  const rows = [...dialog.querySelectorAll('[data-shortcut-id]')]
  expect(rows.map((r) => r.getAttribute('data-shortcut-id')).sort()).toEqual(Object.keys(SHORTCUTS).sort())
  for (const area of ['Anywhere', 'An open session', 'The message box', 'The session list', "A session's menu (open)", 'Live'])
    expect(within(dialog).getByRole('region', { name: area })).toBeInTheDocument()
  const interrupt = dialog.querySelector('[data-shortcut-id="interrupt"]')!
  expect(interrupt.textContent).toContain(SHORTCUTS.interrupt.label)
  expect([...interrupt.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(capsOf(SHORTCUTS.interrupt.keys[0]))
  expect([...dialog.querySelectorAll('[data-shortcut-id="palette"] kbd')].map((k) => k.textContent)).toEqual(['Ctrl', 'K', '/'])
})

it('opens from ⌘K too: "Keyboard shortcuts"', async () => {
  show()
  await screen.findByRole('textbox', { name: 'Elsewhere' })
  fireEvent.keyDown(window, { code: 'KeyK', key: 'k', ctrlKey: true })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'keyboard' } })
  fireEvent.click(screen.getByRole('option', { name: /^Keyboard shortcuts/ }))
  expect(sheet()).toBeInTheDocument()
})

it("a segment's tooltip says its shortcut, from the registry", () => {
  render(
    <Segmented
      aria-label="Show"
      value="a"
      onChange={() => {}}
      options={[
        { value: 'a', label: 'T', title: withKeys('Terminal', 'view') },
        { value: 'b', label: 'C', title: withKeys('Conversation', 'view') },
      ]}
    />,
  )
  expect(screen.getByRole('radio', { name: 'T' })).toHaveAttribute('title', 'Terminal (Alt+V)')
  expect(screen.getByRole('radio', { name: 'C' })).toHaveAttribute('title', 'Conversation (Alt+V)')
})
