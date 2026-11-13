import { act, render, renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { panelSwipe, useComposerPanel, usePanelSwipe } from './use-composer-panel'

describe('panelSwipe', () => {
  it('opens on a swipe up of 40 px or more, and closes on one down', () => {
    expect(panelSwipe(0, -40, false, null)).toBe('open')
    expect(panelSwipe(8, -60, false, null)).toBe('open')
    expect(panelSwipe(0, 45, true, null)).toBe('close')
  })
  it('does nothing on a short or a sideways one, nor the way the panel already is', () => {
    expect(panelSwipe(0, -30, false, null)).toBeNull()
    expect(panelSwipe(-80, -40, false, null)).toBeNull()
    expect(panelSwipe(0, -60, true, null)).toBeNull()
    expect(panelSwipe(0, 60, false, null)).toBeNull()
  })
  it('leaves a textarea that can still scroll that way to scroll', () => {
    expect(panelSwipe(0, -60, false, { up: true, down: true })).toBeNull()
    expect(panelSwipe(0, -60, false, { up: true, down: false })).toBe('open') // at its end
    expect(panelSwipe(0, 60, true, { up: true, down: false })).toBeNull()
    expect(panelSwipe(0, 60, true, { up: false, down: true })).toBe('close') // at its start
  })
})

describe('useComposerPanel', () => {
  it('is closed at first, stays open in its session, and is closed in another one', () => {
    const { result, rerender } = renderHook(({ key }) => useComposerPanel(key), { initialProps: { key: 'd/a' } })
    expect(result.current[0]).toBe(false)
    act(() => result.current[1](true))
    rerender({ key: 'd/a' })
    expect(result.current[0]).toBe(true)
    rerender({ key: 'd/b' })
    expect(result.current[0]).toBe(false)
    rerender({ key: 'd/a' }) // back: not reopened
    expect(result.current[0]).toBe(false)
  })
})

/** A composer with a textarea, its panel state shown, swiped with touch events. */
function Composer({ scroll }: { scroll?: { top: number; height: number; client: number } }) {
  const box = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useComposerPanel('d/a')
  usePanelSwipe(box, open, setOpen)
  return (
    <div ref={box} data-open={open}>
      <textarea
        ref={(el) => {
          if (!el || !scroll) return
          Object.defineProperties(el, {
            scrollTop: { value: scroll.top, configurable: true },
            scrollHeight: { value: scroll.height, configurable: true },
            clientHeight: { value: scroll.client, configurable: true },
          })
        }}
      />
    </div>
  )
}

const swipe = (el: Element, dx: number, dy: number) => {
  const at = (x: number, y: number) => [{ identifier: 1, target: el, clientX: x, clientY: y }] as unknown as TouchList
  act(() => {
    el.dispatchEvent(Object.assign(new Event('touchstart', { bubbles: true }), { touches: at(100, 300) }))
    for (const f of [0.25, 0.5, 1])
      el.dispatchEvent(Object.assign(new Event('touchmove', { bubbles: true }), { touches: at(100 + dx * f, 300 + dy * f) }))
    el.dispatchEvent(Object.assign(new Event('touchend', { bubbles: true }), { touches: [] as unknown as TouchList }))
  })
}

describe('usePanelSwipe', () => {
  it('opens on a swipe up on the textarea, and closes on one down', () => {
    const { container } = render(<Composer />)
    const box = container.firstElementChild!
    swipe(container.querySelector('textarea')!, 0, -60)
    expect(box.getAttribute('data-open')).toBe('true')
    swipe(container.querySelector('textarea')!, 0, 60)
    expect(box.getAttribute('data-open')).toBe('false')
  })
  it('ignores a sideways or short swipe', () => {
    const { container } = render(<Composer />)
    swipe(container.querySelector('textarea')!, -90, -40)
    swipe(container.querySelector('textarea')!, 0, -20)
    expect(container.firstElementChild!.getAttribute('data-open')).toBe('false')
  })
  it('lets a textarea with more text below scroll instead', () => {
    const { container } = render(<Composer scroll={{ top: 0, height: 300, client: 100 }} />)
    swipe(container.querySelector('textarea')!, 0, -60)
    expect(container.firstElementChild!.getAttribute('data-open')).toBe('false')
  })
})
