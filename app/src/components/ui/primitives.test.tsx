import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent } from './dialog'
import { Drawer } from './drawer'
import { Pager } from './pager'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'
import { Markdown } from './markdown'
import { NavCount, NavSection } from './nav'
import { Pane, PaneBody, PaneHeader } from './pane'
import { Segmented } from './segmented'
import { SuggestInput } from './suggest-input'
import { SwipeAction, SwipeActions } from './swipe-actions'

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

  it('takes a smaller text size when the labels do not fit', () => {
    const widths = { offsetWidth: 300, clientWidth: 200 } // the full labels need 300px, the row has 200
    const spies = Object.entries(widths).map(([key, px]) =>
      vi.spyOn(HTMLElement.prototype, key as 'offsetWidth' | 'clientWidth', 'get').mockReturnValue(px),
    )
    render(<Segmented aria-label="Show" value="a" onChange={() => {}} options={[{ value: 'a', label: 'Needs you' }]} />)
    expect(screen.getByRole('radio', { name: 'Needs you' })).toHaveClass('text-xs')
    spies.forEach((spy) => spy.mockRestore())
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

  it('leaves the page clickable after a dialog opened from an item closes', () => {
    function MenuWithDialog() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger>More</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setOpen(true)}>Rename</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {open ? (
            <Dialog open onOpenChange={setOpen}>
              <DialogContent title="Rename session">
                <button type="button" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </DialogContent>
            </Dialog>
          ) : null}
        </>
      )
    }
    render(<MenuWithDialog />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.pointerEvents).not.toBe('none')
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

  it('bolds text that ends in CJK punctuation', () => {
    render(<Markdown>{'**还没确认的：**关掉日志'}</Markdown>)
    expect(screen.getByText('还没确认的：').tagName).toBe('STRONG')
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

describe('SwipeActions', () => {
  it('reveals its actions on a swipe right, keeps the swipe from clicking the row, and runs an action', () => {
    const opened = vi.fn()
    const hide = vi.fn()
    render(
      <SwipeActions actions={<SwipeAction icon={() => null} label="Hide" onClick={hide} />}>
        <button type="button" onClick={opened}>
          row
        </button>
      </SwipeActions>,
    )
    const row = screen.getByRole('button', { name: 'row' })
    const tray = screen.getByRole('button', { name: 'Hide', hidden: true }).parentElement!
    expect(tray).toHaveAttribute('aria-hidden', 'true') // closed
    Object.defineProperty(tray, 'offsetWidth', { value: 64 })
    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 10, clientY: 10, pointerId: 1 })
    row.parentElement!.setPointerCapture = () => {}
    fireEvent.pointerMove(row, { pointerType: 'touch', clientX: 90, clientY: 12, pointerId: 1 })
    fireEvent.pointerUp(row, { pointerType: 'touch', clientX: 90, clientY: 12, pointerId: 1 })
    fireEvent.click(row)
    expect(opened).not.toHaveBeenCalled()
    expect(tray).toHaveAttribute('aria-hidden', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(hide).toHaveBeenCalled()
    expect(tray).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Drawer', () => {
  it('lays its children out in place, or slides them in over the page and closes on the scrim, Escape or a link', () => {
    const onOpenChange = vi.fn()
    const { rerender, container } = render(
      <Drawer drawer={false} open={false} onOpenChange={onOpenChange} label="Sessions">
        <a href="#s1">Session one</a>
      </Drawer>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('link', { name: 'Session one' })).toBeTruthy()

    rerender(
      <Drawer drawer open onOpenChange={onOpenChange} label="Sessions">
        <a href="#s1">Session one</a>
      </Drawer>,
    )
    expect(screen.getByRole('dialog', { name: 'Sessions' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(container.querySelector('[aria-hidden]')!)
    fireEvent.click(screen.getByRole('link', { name: 'Session one' }))
    expect(onOpenChange.mock.calls).toEqual([[false], [false], [false]])
  })
})

describe('Pager', () => {
  it('shows one page of several, and a swipe right on the first one goes past it', () => {
    const onPastStart = vi.fn()
    render(
      <Pager index={0} onPastStart={onPastStart} label="Views">
        <p>Terminal</p>
        <p>Conversation</p>
      </Pager>,
    )
    const pager = screen.getByRole('region', { name: 'Views' })
    expect(screen.getByText('Conversation').parentElement?.getAttribute('aria-hidden')).toBe('true')
    fireEvent.touchStart(pager, { touches: [{ clientX: 10, clientY: 100 }] })
    fireEvent.touchMove(pager, { touches: [{ clientX: 14, clientY: 140 }] }) // mostly down: a scroll
    fireEvent.touchMove(pager, { touches: [{ clientX: 60, clientY: 140 }] })
    expect(onPastStart).not.toHaveBeenCalled()
    fireEvent.touchStart(pager, { touches: [{ clientX: 10, clientY: 100 }] })
    fireEvent.touchMove(pager, { touches: [{ clientX: 60, clientY: 104 }] })
    expect(onPastStart).toHaveBeenCalledTimes(1)
  })
})
