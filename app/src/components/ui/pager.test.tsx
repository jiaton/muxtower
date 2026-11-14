import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { keepFocus } from './gesture'
import { Pager } from './pager'

it('takes no sideways wheel (a trackpad, a mouse’s back and forward made gestures): all the browser’s', () => {
  render(
    <Pager label="Views" index={0}>
      <p>terminal</p>
      <p>conversation</p>
    </Pager>,
  )
  for (const deltaX of [-80, 80]) {
    const event = new WheelEvent('wheel', { deltaX, deltaY: 0, bubbles: true, cancelable: true })
    screen.getByRole('region').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  }
  expect(screen.getByText('conversation').parentElement?.getAttribute('aria-hidden')).toBe('true') // no page turned
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
