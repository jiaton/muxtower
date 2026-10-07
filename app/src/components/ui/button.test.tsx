import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Button } from './button'

it('renders an accessible button with variant classes', () => {
  render(<Button variant="approve">Yes</Button>)
  const button = screen.getByRole('button', { name: 'Yes' })
  expect(button).toHaveAttribute('type', 'button')
  expect(button.className).toContain('bg-success')
})
