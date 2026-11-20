import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { CommandPalette, type PaletteSection } from './command-palette'

function Harness({ onPick }: { onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const sections: PaletteSection[] = [
    {
      id: 's',
      label: 'Sessions',
      items: ['alpha', 'beta'].filter((x) => x.includes(query)).map((x) => ({ id: x, label: x, onSelect: () => onPick(x) })),
    },
    { id: 'c', label: 'Commands', items: [{ id: 'session-only', label: 'Session only', keys: 'Alt+F', onSelect: () => onPick('session-only') }] },
  ]
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        query={query}
        onQueryChange={setQuery}
        sections={sections}
        label="Go to"
        empty="Nothing"
      />
    </>
  )
}

it('moves with the arrows across sections, wraps, and picks with Enter, then closes', () => {
  const onPick = vi.fn()
  render(<Harness onPick={onPick} />)
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  const box = screen.getByRole('combobox', { name: 'Go to' })
  expect(screen.getByRole('option', { name: 'alpha' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(box, { key: 'ArrowDown' })
  fireEvent.keyDown(box, { key: 'ArrowDown' })
  expect(screen.getByRole('option', { name: 'Session only' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(box, { key: 'ArrowDown' }) // wraps to the first
  expect(screen.getByRole('option', { name: 'alpha' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(box, { key: 'ArrowUp' })
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(onPick).toHaveBeenCalledWith('session-only')
  expect(screen.queryByRole('combobox')).toBeNull()
})

it('typing narrows and starts again from the top; a click picks; Esc closes and gives focus back', async () => {
  const onPick = vi.fn()
  render(<Harness onPick={onPick} />)
  const opener = screen.getByRole('button', { name: 'Open' })
  opener.focus()
  fireEvent.click(opener)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bet' } })
  expect(screen.queryByRole('option', { name: 'alpha' })).toBeNull()
  expect(screen.getByRole('option', { name: 'beta' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
  expect(screen.queryByRole('combobox')).toBeNull()
  await waitFor(() => expect(document.activeElement).toBe(opener))
  fireEvent.click(opener)
  fireEvent.click(screen.getByRole('option', { name: 'beta' }))
  expect(onPick).toHaveBeenCalledWith('beta')
})

it('says so when nothing matches; a phone gets it the width of the screen, at the top', () => {
  render(<Harness onPick={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } })
  expect(screen.getByText('Session only')).toBeInTheDocument() // a command still there
  const dialog = screen.getByRole('dialog')
  expect(dialog.className).toMatch(/inset-x-0 top-0/)
})
