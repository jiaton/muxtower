import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { Drawer } from './drawer'
import type { Pull } from './gesture'

let pull: Pull | null = null

function Page({ open: initial = false, onOpenChange = () => {} }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const content = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(initial)
  return (
    <>
      <Drawer
        drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          onOpenChange(next)
        }}
        onPull={(p) => (pull = p)}
        label="Navigation"
        over
        push={content}
      >
        <nav>sidebar</nav>
      </Drawer>
      <div ref={content} data-testid="content" style={{ width: '390px' }}>
        the list
      </div>
      <button onClick={() => setOpen(true)}>open</button>
    </>
  )
}

const panelWidth = () => Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 288 })

afterEach(() => {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth
  vi.unstubAllGlobals()
  pull = null
})

it('opening and closing slide the page beside it by a transform, never changing its width', () => {
  panelWidth()
  render(<Page />)
  const content = screen.getByTestId('content')
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  expect(content.style.transform).toBe('translateX(288px)')
  expect(content.style.width).toBe('390px') // the same: a terminal in it is not fitted again
  fireEvent.click(document.querySelector('[aria-hidden].fixed')!) // the strip of the page that shows: closes
  expect(content.style.transform).toBe('')
  expect(content.style.width).toBe('390px')
})

it('a drag moves the drawer and the page together, with the finger', () => {
  panelWidth()
  render(<Page />)
  const content = screen.getByTestId('content')
  const panel = screen.getByRole('dialog', { name: 'Navigation', hidden: true })
  act(() => pull!.move(100))
  expect(panel.style.translate).toBe('-188px')
  expect(content.style.transform).toBe('translateX(100px)')
  expect(content.style.willChange).toBe('transform') // while the finger has it
  expect(content.style.transition).toBe('none')
  act(() => pull!.end(250, 0.5)) // far and quick enough: it opens
  expect(content.style.transform).toBe('translateX(288px)')
})

it('with reduced motion it shows and hides, without sliding', () => {
  panelWidth()
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
  render(<Page />)
  const content = screen.getByTestId('content')
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  expect(content.style.transition).toBe('none')
  expect(content.style.transform).toBe('translateX(288px)')
})

it('once shut and done sliding, paints nothing (no sliver of its border at the edge); the page is left untransformed', () => {
  panelWidth()
  render(<Page />)
  const panel = screen.getByRole('dialog', { name: 'Navigation', hidden: true })
  const content = screen.getByTestId('content')
  expect(panel).toHaveClass('invisible') // shut from the start
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  expect(panel).not.toHaveClass('invisible')
  expect(panel).not.toHaveClass('-translate-x-full')
  fireEvent.click(document.querySelector('[aria-hidden].fixed')!) // close
  expect(panel).toHaveClass('-translate-x-full')
  expect(panel).not.toHaveClass('invisible') // still sliding away: seen going
  expect(content.style.transform).toBe('')
  fireEvent.transitionEnd(panel, { propertyName: 'translate' })
  expect(panel).toHaveClass('invisible')
  expect(content.style.transform).toBe('')
})

it('shows while a finger pulls it in from shut, and is hidden again if let go shut', () => {
  vi.useFakeTimers()
  panelWidth()
  render(<Page />)
  const panel = screen.getByRole('dialog', { name: 'Navigation', hidden: true })
  act(() => pull!.move(40))
  expect(panel.style.visibility).toBe('visible') // over the class that hides it
  act(() => pull!.end(40, 0)) // not far enough: back shut
  act(() => void vi.advanceTimersByTime(1000))
  expect(panel.style.visibility).toBe('')
  expect(panel).toHaveClass('invisible')
  vi.useRealTimers()
})
