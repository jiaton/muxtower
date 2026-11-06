import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Drawer } from './drawer'
import { SwipeAction, SwipeActions } from './swipe-actions'

afterEach(() => {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth
})

/** A swipe left, as a finger makes it: touch events (the drawer's) and pointer events (the row's). */
function swipeLeft(el: Element, from = 300, to = 80) {
  fireEvent.touchStart(el, { touches: [{ clientX: from, clientY: 100 }] })
  fireEvent.pointerDown(el, { pointerType: 'touch', clientX: from, clientY: 100, pointerId: 1 })
  for (const x of [from - 20, (from + to) / 2, to]) {
    fireEvent.touchMove(el, { touches: [{ clientX: x, clientY: 101 }] })
    fireEvent.pointerMove(el, { pointerType: 'touch', clientX: x, clientY: 101, pointerId: 1 })
  }
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: to, clientY: 101 }] })
  fireEvent.pointerUp(el, { pointerType: 'touch', clientX: to, clientY: 101, pointerId: 1 })
}

function List({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Drawer drawer open={open} onOpenChange={onOpenChange} label="Sessions">
      <header>All sessions</header>
      <SwipeActions actions={<SwipeAction icon={() => null} label="Hide" onClick={() => {}} />}>
        <span>a row</span>
      </SwipeActions>
    </Drawer>
  )
}

const prepare = () => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 160 })
  const row = screen.getByText('a row').parentElement!
  row.setPointerCapture = () => {}
  return row
}

it('in the list drawer: a swipe left on a row shows its actions, and the drawer stays', () => {
  const onOpenChange = vi.fn()
  render(<List open onOpenChange={onOpenChange} />)
  const row = prepare()
  swipeLeft(row)
  expect(row.closest('[data-swipe-row]')).toHaveAttribute('data-swipe-open', 'true')
  expect(onOpenChange).not.toHaveBeenCalled() // the drawer neither closed nor landed
})

it('in the list drawer: a swipe left off the rows still closes it', async () => {
  const onOpenChange = vi.fn()
  render(<List open onOpenChange={onOpenChange} />)
  prepare()
  swipeLeft(screen.getByText('All sessions'), 300, 20)
  await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false)) // after the landing set off
})

it('with the sidebar shut: a swipe left on a row shows its actions, and the sidebar does nothing', () => {
  const sidebar = vi.fn()
  const pulled = vi.fn()
  render(
    <>
      <Drawer drawer open={false} onOpenChange={sidebar} onPull={pulled} label="Navigation" over>
        <nav>All sessions</nav>
      </Drawer>
      <SwipeActions actions={<SwipeAction icon={() => null} label="Hide" onClick={() => {}} />}>
        <span>a row</span>
      </SwipeActions>
    </>,
  )
  const row = prepare()
  swipeLeft(row)
  expect(row.closest('[data-swipe-row]')).toHaveAttribute('data-swipe-open', 'true')
  expect(sidebar).not.toHaveBeenCalled()
})
