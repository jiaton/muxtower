import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLayoutPrefs } from '@/lib/layout-prefs'
import { TerminalView } from './terminal-view'

const LINE_PX = 20
let boxHeight = 600
let boxWidth = 800
let resized: (() => void) | null = null

beforeEach(() => {
  vi.useFakeTimers()
  boxHeight = 600
  boxWidth = 800
  vi.spyOn(console, 'info').mockImplementation(() => {})
  // jsdom lays nothing out: lines are LINE_PX tall, the box is `boxHeight`.
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => LINE_PX })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => boxHeight })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => boxWidth })
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
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

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

it('never resizes the pane for what comes and goes around the view; a window resized once', () => {
  const onFit = vi.fn()
  render(<TerminalView ansi={output(0, 50)} fontSize={13} onFit={onFit} />)
  act(() => vi.advanceTimersByTime(300))
  expect(onFit).toHaveBeenCalledTimes(1)
  const rows = onFit.mock.calls[0]![0].rows
  for (const shrink of [3, 6, 12]) {
    boxHeight -= shrink * LINE_PX // Live's row, a quote card, the + panel, a long draft
    act(() => {
      resized!()
      vi.advanceTimersByTime(300)
    })
  }
  boxHeight += 21 * LINE_PX // all gone again
  act(() => {
    resized!()
    vi.advanceTimersByTime(300)
  })
  expect(onFit).toHaveBeenCalledTimes(1) // nothing sent: no repaint
  const tall = window.innerHeight
  Object.defineProperty(window, 'innerHeight', { value: tall - 10 * LINE_PX, configurable: true })
  boxHeight -= 10 * LINE_PX // the window made shorter
  act(() => {
    resized!()
    vi.advanceTimersByTime(300)
  })
  expect(onFit).toHaveBeenCalledTimes(2)
  expect(onFit.mock.calls[1]![0].rows).toBe(rows - 10)
  Object.defineProperty(window, 'innerHeight', { value: tall, configurable: true })
})

it('marks a screen as last seen as updating, until the live one comes, with no other change', () => {
  const { rerender } = render(<TerminalView ansi={'$ ls\nREADME.md'} fontSize={13} stale />)
  expect(screen.getByText('Updating…')).toBeTruthy()
  expect(screen.getByText('README.md')).toBeTruthy() // the kept screen shows meanwhile
  rerender(<TerminalView ansi={'$ ls\nREADME.md\nsrc'} fontSize={13} />)
  expect(screen.queryByText('Updating…')).toBeNull()
  expect(screen.getByText('src')).toBeTruthy()
})

describe('a deliberate frame change always refits, even back to the size before', () => {
  const setWindow = (w: number, h: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
  }
  const settle = (change: () => void) =>
    act(() => {
      change()
      vi.advanceTimersByTime(300)
    })
  const sizes = (onFit: ReturnType<typeof vi.fn>) => onFit.mock.calls.map(([s]) => `${s.cols}x${s.rows}`)
  let win: [number, number]
  beforeEach(() => {
    win = [window.innerWidth, window.innerHeight]
    setWindow(1440, 900)
  })
  afterEach(() => {
    setWindow(...win)
    useLayoutPrefs.setState({ layout: 'full', previous: 'full' })
  })

  it('full screen in, then out within 10 s: fitted to the bigger size, then back', () => {
    const onFit = vi.fn()
    render(<TerminalView ansi={output(0, 50)} fontSize={13} onFit={onFit} />)
    act(() => vi.advanceTimersByTime(300))
    settle(() => {
      setWindow(1440, 1000)
      ;[boxWidth, boxHeight] = [1000, 700]
      document.dispatchEvent(new Event('fullscreenchange'))
      resized!()
    })
    settle(() => {
      setWindow(1440, 900)
      ;[boxWidth, boxHeight] = [800, 600]
      document.dispatchEvent(new Event('fullscreenchange'))
      resized!()
    })
    expect(sizes(onFit)).toEqual(['99x30', '124x35', '99x30'])
    expect(console.info).toHaveBeenLastCalledWith('[terminal]', 'fitted to 99x30 (frame: fullscreen)')
  })

  it('full screen on a touch screen (only the height changes) fits the taller and the shorter view', () => {
    const matchMedia = window.matchMedia
    window.matchMedia = ((q: string) => ({
      matches: q === '(pointer: coarse)',
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia
    try {
      const onFit = vi.fn()
      render(<TerminalView ansi={output(0, 50)} fontSize={13} onFit={onFit} />)
      act(() => vi.advanceTimersByTime(300))
      settle(() => {
        boxHeight = 700
        document.dispatchEvent(new Event('fullscreenchange'))
        resized!()
      })
      settle(() => {
        boxHeight = 600
        document.dispatchEvent(new Event('fullscreenchange'))
        resized!()
      })
      expect(sizes(onFit)).toEqual(['99x30', '99x35', '99x30'])
    } finally {
      window.matchMedia = matchMedia
    }
  })

  it('a layout switch, and back within 10 s, fits both ways', () => {
    const onFit = vi.fn()
    render(<TerminalView ansi={output(0, 50)} fontSize={13} onFit={onFit} />)
    act(() => vi.advanceTimersByTime(300))
    settle(() => {
      useLayoutPrefs.getState().setLayout('session')
      boxWidth = 1200
      resized!()
    })
    settle(() => {
      useLayoutPrefs.getState().setLayout('full')
      boxWidth = 800
      resized!()
    })
    expect(sizes(onFit)).toEqual(['99x30', '149x30', '99x30'])
    expect(console.info).toHaveBeenLastCalledWith('[terminal]', 'fitted to 99x30 (frame: layout)')
  })

  it('a window resized A, B, A within 10 s fits both times', () => {
    const onFit = vi.fn()
    render(<TerminalView ansi={output(0, 50)} fontSize={13} onFit={onFit} />)
    act(() => vi.advanceTimersByTime(300))
    settle(() => {
      setWindow(1000, 900)
      boxWidth = 500
      window.dispatchEvent(new Event('resize'))
      resized!()
    })
    settle(() => {
      setWindow(1440, 900)
      boxWidth = 800
      window.dispatchEvent(new Event('resize'))
      resized!()
    })
    expect(sizes(onFit)).toEqual(['99x30', '62x30', '99x30'])
  })

  it('a scrollbar coming and going (content only) is still not bounced back to', () => {
    const onFit = vi.fn()
    render(<TerminalView ansi={output(0, 50)} fontSize={13} onFit={onFit} />)
    act(() => vi.advanceTimersByTime(300))
    settle(() => {
      boxWidth = 785 // a scrollbar came
      resized!()
    })
    settle(() => {
      boxWidth = 800 // and went
      resized!()
    })
    expect(sizes(onFit)).toEqual(['99x30', '98x30'])
    expect(console.info).toHaveBeenLastCalledWith('[terminal]', 'fitted to 98x30 (content)')
  })
})
