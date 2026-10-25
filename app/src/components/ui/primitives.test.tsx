import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'
import { Markdown } from './markdown'
import { NavCount, NavSection } from './nav'
import { Pane, PaneBody, PaneHeader } from './pane'
import { Segmented } from './segmented'
import { SuggestInput } from './suggest-input'

describe('Pane', () => {
  it('renders a header with title, subtitle, actions and extra rows, and a body', () => {
    render(
      <Pane aria-label="List">
        <PaneHeader title={<h1>Sessions</h1>} subtitle="3 sessions" actions={<button type="button">Add</button>}>
          <input aria-label="Search" />
        </PaneHeader>
        <PaneBody>rows</PaneBody>
      </Pane>,
    )
    expect(screen.getByRole('region', { name: 'List' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sessions' })).toBeInTheDocument()
    expect(screen.getByText('3 sessions')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeInTheDocument()
  })
})

describe('Segmented', () => {
  it('marks the current choice and reports a new one', () => {
    const onChange = vi.fn()
    render(
      <Segmented
        aria-label="Show"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    )
    expect(screen.getByRole('radio', { name: 'A' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'B' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })
})

describe('Nav', () => {
  it('shows a section title and only non-zero counts', () => {
    render(
      <NavSection title="Devices">
        <span>
          hub <NavCount count={3} alert />
        </span>
        <span>
          laptop <NavCount count={0} />
        </span>
      </NavSection>,
    )
    expect(screen.getByText('Devices')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('0')).toBeNull()
  })
})

describe('DropdownMenu', () => {
  it('opens on its trigger and runs an item', () => {
    const onSelect = vi.fn()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>More</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Rename</DropdownMenuItem>
          <DropdownMenuCheckboxItem checked>Fit width</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(onSelect).toHaveBeenCalled()
    expect(screen.queryByRole('menuitemcheckbox')).toBeNull() // closed after choosing
  })
})

describe('Markdown', () => {
  it('renders GitHub-flavoured Markdown and shows raw HTML as text', () => {
    render(
      <Markdown>
        {'## Plan\n\n- **one** `x`\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<img src=x onerror=alert(1)>\n\n[docs](https://example.com)'}
      </Markdown>,
    )
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByText('one').tagName).toBe('STRONG')
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('target', '_blank')
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('SuggestInput', () => {
  it('offers matching values on focus and picks one by keyboard or tap', () => {
    const onValueChange = vi.fn()
    const suggestions = [{ value: '~/projects/web', hint: '3 sessions' }, { value: '~/projects/api' }, { value: '~/notes' }]
    const { rerender } = render(
      <SuggestInput aria-label="Directory" value="proj" onValueChange={onValueChange} suggestions={suggestions} />,
    )
    const field = screen.getByRole('combobox', { name: 'Directory' })
    fireEvent.focus(field)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['~/projects/web3 sessions', '~/projects/api'])
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onValueChange).toHaveBeenLastCalledWith('~/projects/api')
    rerender(<SuggestInput aria-label="Directory" value="" onValueChange={onValueChange} suggestions={suggestions} />)
    fireEvent.focus(field)
    fireEvent.click(screen.getByRole('option', { name: /notes/ }))
    expect(onValueChange).toHaveBeenLastCalledWith('~/notes')
  })
})
