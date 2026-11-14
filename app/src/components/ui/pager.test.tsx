import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { keepFocus } from './gesture'
import { Pager } from './pager'

/** A horizontal wheel on the pager (a trackpad's swipe, or a mouse's back or forward made a gesture):
 *  whether the page took it (prevented the browser's own). */
function swipe(deltaX: number) {
  const event = new WheelEvent('wheel', { deltaX, deltaY: 0, bubbles: true, cancelable: true })
  screen.getByRole('region').dispatchEvent(event)
  return event.defaultPrevented
}

describe('Pager and the browser’s back and forward swipe', () => {
  it('takes a swipe toward a page it has; leaves one with no page that way to the browser', () => {
    render(
      <Pager label="Views" index={0} onIndexChange={vi.fn()}>
        <p>terminal</p>
        <p>conversation</p>
      </Pager>,
    )
    expect(swipe(-60)).toBe(false) // back, from the first page: the browser goes back in history
    expect(swipe(60)).toBe(true) // toward the conversation: the page turns
  })
  it('one page: every swipe is the browser’s', () => {
    render(
      <Pager label="Views" index={0}>
        <p>terminal</p>
      </Pager>,
    )
    expect(swipe(-60)).toBe(false)
    expect(swipe(60)).toBe(false)
  })
})

it('keepFocus keeps the focus for the primary button only, never a mouse’s back or forward', () => {
  const press = (button: number) => {
    const e = { button, preventDefault: vi.fn() }
    keepFocus(e)
    return e.preventDefault.mock.calls.length
  }
  expect(press(0)).toBe(1)
  expect(press(3)).toBe(0) // back
  expect(press(4)).toBe(0) // forward
})
