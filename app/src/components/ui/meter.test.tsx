import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Meter, Ring } from './meter'

it('reads its value out, and none when it is not known', () => {
  render(
    <>
      <Meter value={44} label="5-hour session" />
      <Meter value={null} label="Week, Sonnet" />
      <Meter value={130} tone="danger" label="Over" />
    </>,
  )
  expect(screen.getByRole('meter', { name: '5-hour session' })).toHaveAttribute('aria-valuenow', '44')
  const unknown = screen.getByRole('meter', { name: 'Week, Sonnet' })
  expect(unknown).not.toHaveAttribute('aria-valuenow')
  expect(unknown).toBeEmptyDOMElement()
  // Over the top it fills the track, no more.
  expect((screen.getByRole('meter', { name: 'Over' }).firstChild as HTMLElement).style.width).toBe('100%')
})

it('rings what it holds', () => {
  render(
    <Ring value={82} tone="warning" label="5-hour session">
      82%
    </Ring>,
  )
  const ring = screen.getByRole('meter', { name: '5-hour session' })
  expect(ring).toHaveAttribute('aria-valuenow', '82')
  expect(ring).toHaveTextContent('82%')
})
