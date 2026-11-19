import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeyPad } from './key-pad'

// jsdom has no PointerEvent: React Aria's press reads pointerId and pointerType from it.
class TestPointerEvent extends MouseEvent {
  pointerId: number
  pointerType: string
  isPrimary = true
  width = 1
  height = 1
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
  }
}
beforeEach(() => {
  vi.stubGlobal('PointerEvent', TestPointerEvent)
  // jsdom lays nothing out: each key a 40 px square, so a release at (10, 10) is over it, as a finger's is.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 40, height: 40 }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const finger = { pointerType: 'touch', pointerId: 1, button: 0 }
const at = (x: number, y: number) => ({ ...finger, clientX: x, clientY: y })

describe('KeyPad', () => {
  it('a tap sends the key once, on release, and only the keys the session takes', () => {
    const onKey = vi.fn()
    render(<KeyPad keys={[]} onKey={onKey} />)
    const up = screen.getByRole('button', { name: 'Up' })
    fireEvent.pointerDown(up, at(10, 10))
    expect(onKey).not.toHaveBeenCalled() // touching it is not pressing it
    fireEvent.pointerUp(up, at(10, 10))
    fireEvent.click(up, { clientX: 10, clientY: 10, detail: 1 }) // the click a tap ends with (none after a scroll)
    expect(onKey).toHaveBeenCalledExactlyOnceWith('Up')
    expect(screen.getAllByRole('button')).toHaveLength(11)
  })

  it('a scroll starting on a key sends nothing: the browser cancels the press, or the finger moves', () => {
    const onKey = vi.fn()
    render(<KeyPad keys={[]} onKey={onKey} />)
    const up = screen.getByRole('button', { name: 'Up' })
    fireEvent.pointerDown(up, at(10, 10))
    fireEvent.pointerCancel(up, at(10, 30)) // the page took the gesture as a scroll
    fireEvent.pointerUp(up, at(10, 30))
    const left = screen.getByRole('button', { name: 'Left' })
    fireEvent.pointerDown(left, at(10, 10))
    fireEvent.pointerMove(left, at(10, 26))
    fireEvent.pointerUp(left, at(10, 26))
    fireEvent.click(left, { clientX: 10, clientY: 26, detail: 1 }) // even if the browser still clicks
    expect(onKey).not.toHaveBeenCalled()
  })

  it('held still, an arrow repeats until let go; a quick tap does not repeat', () => {
    vi.useFakeTimers()
    const onKey = vi.fn()
    render(<KeyPad keys={[]} onKey={onKey} />)
    const left = screen.getByRole('button', { name: 'Left' })
    fireEvent.pointerDown(left, at(10, 10))
    act(() => void vi.advanceTimersByTime(349))
    expect(onKey).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1 + 110 * 2)) // the hold, then two repeats
    fireEvent.pointerUp(left, at(10, 10))
    fireEvent.click(left, { clientX: 10, clientY: 10, detail: 1 })
    act(() => void vi.advanceTimersByTime(1000))
    expect(onKey).toHaveBeenCalledTimes(3) // none more on letting go
  })

  it('shows a lone interrupt key as one labelled button', () => {
    render(<KeyPad keys={['Escape']} onKey={() => {}} />)
    expect(screen.getByRole('button', { name: 'Escape' })).toHaveTextContent('esc · interrupt')
  })
})
