import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { DatePicker } from './date-picker'

it('loads, shows the month of the day picked, marks it, and picks another; days before `from` cannot be picked', async () => {
  const onSelect = vi.fn()
  render(<DatePicker selected={new Date(2026, 11, 24)} from={new Date(2026, 11, 10)} onSelect={onSelect} />)
  expect(await screen.findByText('December 2026')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /December 24th, 2026/ }).closest('[aria-selected="true"]')).not.toBeNull()
  expect(screen.getByRole('button', { name: /December 9th, 2026/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /December 25th, 2026/ }))
  expect(onSelect.mock.calls[0]![0]).toEqual(new Date(2026, 11, 25))
})
