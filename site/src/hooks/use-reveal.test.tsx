import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReveal } from './use-reveal'

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void

function Page() {
  useReveal()
  return (
    <>
      <section data-reveal id="a" />
      <section data-reveal id="b" />
    </>
  )
}

function stubObserver() {
  let callback: Callback = () => {}
  const observed: Element[] = []
  class Observer {
    constructor(cb: Callback) {
      callback = cb
    }
    observe(el: Element) {
      observed.push(el)
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', Observer)
  return { observed, fire: (target: Element) => callback([{ isIntersecting: true, target }]) }
}

function stubReducedMotion(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches } as MediaQueryList)
}

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.classList.remove('reveal')
})

describe('useReveal', () => {
  it('hides the bands and shows each one as it comes into view', () => {
    stubReducedMotion(false)
    const io = stubObserver()
    const { container } = render(<Page />)
    expect(document.documentElement).toHaveClass('reveal')
    expect(io.observed).toHaveLength(2)
    const a = container.querySelector('#a')!
    io.fire(a)
    expect(a).toHaveAttribute('data-shown')
    expect(container.querySelector('#b')).not.toHaveAttribute('data-shown')
  })

  it('hides nothing when the visitor asks for reduced motion', () => {
    stubReducedMotion(true)
    render(<Page />)
    expect(document.documentElement).not.toHaveClass('reveal')
  })
})
