import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TerminalView } from './terminal-view'

const LINE_PX = 20
let boxHeight = 600
let resized: (() => void) | null = null

beforeEach(() => {
  vi.useFakeTimers()
  boxHeight = 600
  // jsdom lays nothing out: lines are LINE_PX tall, the box is `boxHeight`.
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => LINE_PX })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => boxHeight })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 })
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return (this.querySelector('[role=log] > div:last-child')?.children.length ?? 0) * LINE_PX
    },
  })
  HTMLElement.prototype.getBoundingClientRect = () => ({ width: 80, height: LINE_PX }) as DOMRect
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) {
      resized = callback
    }
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})
afterEach(() => vi.useRealTimers())

const output = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `line ${from + i}`).join('\n')
const shownLines = () => [...screen.getByRole('log').lastElementChild!.children].map((d) => d.textContent)

it('keeps the reader where they are while output pushes lines off the top, and trims them back at the bottom', () => {
  const { rerender } = render(<TerminalView ansi={output(0, 50)} fontSize={13} />)
  const log = screen.getByRole('log')
  log.scrollTop = 100 // scrolled up, reading
  fireEvent.scroll(log)
  let writes = 0
  const real = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!
  Object.defineProperty(log, 'scrollTop', {
    configurable: true,
    get: () => real.get!.call(log),
    set: (v: number) => {
      writes++
      real.set!.call(log, v)
    },
  })
  rerender(<TerminalView ansi={output(5, 55)} fontSize={13} />) // five lines pushed off the top
  expect(writes).toBe(0) // nothing moved under the reader, no scroll written mid-gesture
  expect(shownLines()[0]).toBe('line 0') // still there, above
  expect(shownLines().at(-1)).toBe('line 54')

  log.scrollTop = log.scrollHeight // back at the bottom
  fireEvent.scroll(log)
  rerender(<TerminalView ansi={output(6, 56)} fontSize={13} />)
  expect(shownLines()[0]).toBe('line 6')
  expect(shownLines()).toHaveLength(50)
})

it('resizes the pane for a real change of height, not for a bar shown over it a moment', () => {
  const onFit = vi.fn()
  render(<TerminalView ansi={output(0, 50)} fontSize={13} onFit={onFit} />)
  act(() => vi.advanceTimersByTime(300))
  expect(onFit).toHaveBeenCalledTimes(1)
  const rows = onFit.mock.calls[0]![0].rows
  boxHeight -= 2 * LINE_PX // Live's bar: two rows
  act(() => {
    resized!()
    vi.advanceTimersByTime(300)
  })
  expect(onFit).toHaveBeenCalledTimes(1)
  boxHeight -= 10 * LINE_PX // the keyboard
  act(() => {
    resized!()
    vi.advanceTimersByTime(300)
  })
  expect(onFit).toHaveBeenCalledTimes(2)
  expect(onFit.mock.calls[1]![0].rows).toBe(rows - 12)
})
