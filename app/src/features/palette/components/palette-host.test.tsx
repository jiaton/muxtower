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
  show()
  await screen.findByRole('textbox', { name: 'Elsewhere' })
  fireEvent.keyDown(window, { code: 'KeyK', key: 'k', ctrlKey: true })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'focus' } })
  const item = screen.getByRole('option', { name: /Focus mode/ })
  expect(item).toHaveTextContent('Alt')
  const before = useLayoutPrefs.getState().sidebar
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
  expect(useLayoutPrefs.getState().sidebar).toBe(!before)
  expect(screen.queryByRole('combobox')).toBeNull()
})
