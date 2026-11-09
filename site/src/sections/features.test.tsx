import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Features } from './features'

describe('Features', () => {
  it('has one cell per feature, each with its title and picture', () => {
    render(<Features />)
    for (const title of [
      'Push, reply, approve',
      'One assistant over all of them',
      'Start at your desk',
      'Update the hub only',
      'Build your own client',
      'Talk instead of type',
    ])
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument()
    expect(screen.getByText('Approve Bash: npm test -- payments')).toBeInTheDocument()
    expect(screen.getByText('send ✓ (on device)')).toBeInTheDocument()
    expect(screen.getByText(/WS\s+\/v1\/stream/)).toBeInTheDocument()
  })
})
