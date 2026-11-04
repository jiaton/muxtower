import { afterEach, describe, expect, it, vi } from 'vitest'
import { startReveal } from './reveal'

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void

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

const reduced = (matches: boolean) => vi.spyOn(window, 'matchMedia').mockReturnValue({ matches } as MediaQueryList)

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.classList.remove('reveal')
  document.body.innerHTML = ''
})

describe('startReveal', () => {
  it('hides the bands and shows each one as it comes into view', () => {
    reduced(false)
    document.body.innerHTML = '<div data-reveal id="a"></div><div data-reveal id="b"></div>'
    const io = stubObserver()
    startReveal()
    expect(document.documentElement).toHaveClass('reveal')
    expect(io.observed).toHaveLength(2)
    io.fire(document.getElementById('a')!)
    expect(document.getElementById('a')).toHaveAttribute('data-shown')
    expect(document.getElementById('b')).not.toHaveAttribute('data-shown')
  })

  it('hides nothing when the visitor asks for reduced motion', () => {
    reduced(true)
    startReveal()
    expect(document.documentElement).not.toHaveClass('reveal')
  })
})
