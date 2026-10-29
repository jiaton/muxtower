import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent } from './dialog'
import { Drawer } from './drawer'
import { axisOf, landing, landMs, Speed, type Pull } from './gesture'
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

  it('opens on a tilted, drifting flick that is short of halfway', () => {
    render(
      <SwipeActions actions={<SwipeAction icon={() => null} label="Hide" onClick={() => {}} />}>
        <span>row</span>
      </SwipeActions>,
    )
    const row = screen.getByText('row').parentElement!
    const tray = screen.getByRole('button', { name: 'Hide', hidden: true }).parentElement!
    Object.defineProperty(tray, 'offsetWidth', { value: 128 })
    row.setPointerCapture = () => {}
    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(row, { pointerType: 'touch', clientX: 20, clientY: 21, pointerId: 1 }) // 48° off level
    expect(fireEvent.touchMove(row, { touches: [{ clientX: 50, clientY: 60 }] })).toBe(false) // drifts: no scroll
    fireEvent.pointerMove(row, { pointerType: 'touch', clientX: 50, clientY: 60, pointerId: 1 })
    fireEvent.pointerUp(row, { pointerType: 'touch', clientX: 50, clientY: 60, pointerId: 1 })
    expect(tray).toHaveAttribute('aria-hidden', 'false')
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

  it('closes on a swipe left, and leaves a swipe right to what is under it', () => {
    const onOpenChange = vi.fn()
    render(
      <Drawer drawer open onOpenChange={onOpenChange} label="Sessions">
        <p>list</p>
      </Drawer>,
    )
    const panel = screen.getByRole('dialog', { name: 'Sessions' })
    Object.defineProperty(panel, 'offsetWidth', { value: 320 })
    fireEvent.touchStart(panel, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchMove(panel, { touches: [{ clientX: 220, clientY: 102 }] }) // right: a row's
    fireEvent.touchMove(panel, { touches: [{ clientX: 20, clientY: 102 }] })
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 20, clientY: 102 }] })
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.touchStart(panel, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchMove(panel, { touches: [{ clientX: 190, clientY: 108 }] }) // tilted, left
    expect(fireEvent.touchMove(panel, { touches: [{ clientX: 20, clientY: 160 }] })).toBe(false) // no scroll under it
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 20, clientY: 160 }] })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('Drawer pulled open', () => {
  it('follows the finger while shut, then opens or goes back by where it let go', () => {
    const onOpenChange = vi.fn()
    const handed: { pull: Pull | null } = { pull: null }
    render(
      <Drawer drawer open={false} onOpenChange={onOpenChange} onPull={(pull) => (handed.pull = pull)} label="Sessions">
        <p>List</p>
      </Drawer>,
    )
    const panel = screen.getByText('List').parentElement!
    Object.defineProperty(panel, 'offsetWidth', { value: 320 })
    const pull = handed.pull!
    pull.move(100)
    expect(panel.style.translate).toBe('-220px')
    pull.end(100, 0) // not halfway, and slow: back
    expect(onOpenChange).not.toHaveBeenCalled()
    pull.move(60)
    pull.end(60, 1) // a flick: open
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })
})

describe('Pager', () => {
  it('shows one page of several, and a swipe right on the first one pulls in what is before it, with the finger', () => {
    const pull = { move: vi.fn(), end: vi.fn() }
    render(
      <Pager index={0} pastStart={pull} label="Views">
        <p>Terminal</p>
        <p>Conversation</p>
      </Pager>,
    )
    const pager = screen.getByRole('region', { name: 'Views' })
    expect(screen.getByText('Conversation').parentElement?.getAttribute('aria-hidden')).toBe('true')
    fireEvent.touchStart(pager, { touches: [{ clientX: 10, clientY: 100 }] })
    fireEvent.touchMove(pager, { touches: [{ clientX: 14, clientY: 140 }] }) // mostly down: a scroll
    fireEvent.touchMove(pager, { touches: [{ clientX: 60, clientY: 140 }] })
    expect(pull.move).not.toHaveBeenCalled()
    fireEvent.touchStart(pager, { touches: [{ clientX: 10, clientY: 100 }] })
    fireEvent.touchMove(pager, { touches: [{ clientX: 22, clientY: 102 }] }) // told a swipe: it starts here
    fireEvent.touchMove(pager, { touches: [{ clientX: 80, clientY: 104 }] })
    fireEvent.touchMove(pager, { touches: [{ clientX: 140, clientY: 104 }] })
    expect(pull.move.mock.calls.map(([px]) => px)).toEqual([0, 58, 118]) // not opened before it lets go
    expect(pull.end).not.toHaveBeenCalled()
    expect(pager.firstElementChild).toHaveStyle({ transform: 'translateX(calc(0% + 0px))' }) // the pages stay
    fireEvent.touchEnd(pager, { changedTouches: [{ clientX: 140, clientY: 104 }] })
    expect(pull.end).toHaveBeenCalledWith(118, expect.any(Number))
  })

  it('keeps a tilted swipe a swipe however it drifts, and lands on the next page as soon as it lets go', () => {
    const onIndexChange = vi.fn()
    render(
      <Pager index={0} onIndexChange={onIndexChange} label="Views">
        <p>Terminal</p>
        <p>Conversation</p>
      </Pager>,
    )
    const pager = screen.getByRole('region', { name: 'Views' })
    Object.defineProperty(pager, 'clientWidth', { value: 400 })
    fireEvent.touchStart(pager, { touches: [{ clientX: 300, clientY: 100 }] })
    fireEvent.touchMove(pager, { touches: [{ clientX: 290, clientY: 108 }] }) // 39° off level: sideways
    expect(fireEvent.touchMove(pager, { touches: [{ clientX: 80, clientY: 190 }] })).toBe(false) // drifts: no scroll
    fireEvent.touchEnd(pager, { touches: [] })
    expect(onIndexChange).toHaveBeenCalledWith(1)
    expect(screen.getByText('Conversation').parentElement?.getAttribute('aria-hidden')).toBe('false') // takes taps now
    expect(pager.firstElementChild).toHaveStyle({ transform: 'translateX(calc(-100% + 0px))' })
  })
})

describe('gestures', () => {
  it('tell a swipe from a scroll by its first pixels, and carry a flick on', () => {
    expect(axisOf(4, 3)).toBeUndefined()
    expect([axisOf(10, 11), axisOf(10, 13), axisOf(-10, 2)]).toEqual(['x', 'y', 'x'])
    const speed = new Speed()
    speed.add(0, 1000)
    speed.add(10, 1010)
    speed.add(60, 1050)
    expect(speed.get(1060)).toBeCloseTo(1.2)
    expect(speed.get(1300)).toBe(0) // it stopped before letting go
    const held = new Speed()
    held.add(0, 1000)
    held.add(24, 1300) // pressed, held, then one quick move
    held.add(24, 1302) // and the lift
    expect(held.get(1302)).toBeGreaterThan(1)
    expect(landing(60, 1.2, 60)).toBe(Infinity) // a short flick goes on
    expect(landing(-60, 0.1, -60)).toBe(-40) // a slow one, a little ahead
    expect(landing(12, 2, 12)).toBe(12) // a twitch stays where it is, however quick
    expect([landMs(390, 0), landMs(240, 1.6), landMs(4, 3)]).toEqual([190, 150, 110]) // brief, never abrupt
  })
})
