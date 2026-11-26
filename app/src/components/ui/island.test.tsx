import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Island, morph } from './island'

afterEach(() => {
  vi.unstubAllGlobals()
  // @ts-expect-error: put back as jsdom has it (none)
  delete document.startViewTransition
})

it('is a chip with what it says, or a pill that settles when tapped', () => {
  const onPress = vi.fn()
  render(
    <>
      <Island shape="chip" title="Claude 5h 44%" name="usage" />
      <Island shape="float" title="Claude · 5-hour session" detail="Resets 14:10" onPress={onPress} label="Claude at 82%. Dismiss" />
    </>,
  )
  const chip = screen.getByText('Claude 5h 44%').closest('div')!
  expect(chip.style.viewTransitionName).toBe('usage')
  fireEvent.click(screen.getByRole('button', { name: 'Claude at 82%. Dismiss' }))
  expect(onPress).toHaveBeenCalledOnce()
})

it('changes shape at once without View Transitions (Safari before 18)', () => {
  expect(document.startViewTransition).toBeUndefined()
  const update = vi.fn()
  morph(update)
  expect(update).toHaveBeenCalledOnce()
})

it('morphs through a view transition where there is one, and not under reduced motion', () => {
  const start = vi.fn((run: () => void) => run())
  document.startViewTransition = start as unknown as typeof document.startViewTransition
  const update = vi.fn()
  morph(update)
  expect(start).toHaveBeenCalledOnce()
  expect(update).toHaveBeenCalledOnce()

  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }))
  morph(update)
  expect(start).toHaveBeenCalledOnce()
  expect(update).toHaveBeenCalledTimes(2)
})
