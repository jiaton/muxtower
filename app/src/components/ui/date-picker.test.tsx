import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, expect, it, vi } from 'vitest'
import { DatePicker } from './date-picker'

// The picker loads react-day-picker lazily, on its first render, and the test waits for the month to show.
// On a loaded machine (6 CPU burners on 4 cores, the runner at nice 10) that took two steps the 1 s of a
// default findBy could not cover: the first import(), which here also has the test runner transform the
// library (about 5 s; 0.3 s idle), and then rendering the month once the lazy component resolves (1.9 to
// 2.4 s; 0.3 s idle). So the import is done once before (`beforeAll`: the same module, then cached, within the
// hook's own 10 s), and the wait for the month is given 5 s: twice the slowest render measured, far
// under the test's 15 s, and a picker that never shows its month still fails. The test still takes the real
// lazy path (skeleton, then the month).
beforeAll(async () => {
  await import('react-day-picker')
})

it('loads, shows the month of the day picked, marks it, and picks another; days before `from` cannot be picked', async () => {
  const onSelect = vi.fn()
  render(<DatePicker selected={new Date(2026, 11, 24)} from={new Date(2026, 11, 10)} onSelect={onSelect} />)
  expect(await screen.findByText('December 2026', undefined, { timeout: 5_000 })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /December 24th, 2026/ }).closest('[aria-selected="true"]')).not.toBeNull()
  expect(screen.getByRole('button', { name: /December 9th, 2026/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /December 25th, 2026/ }))
  expect(onSelect.mock.calls[0]![0]).toEqual(new Date(2026, 11, 25))
})
