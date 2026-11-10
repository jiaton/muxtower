import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Features } from './features'

describe('Features', () => {
  it('has one cell per feature, each with its title and picture', () => {
    render(<Features />)
    for (const title of [
      'Talk to any of them',
      'One assistant over all of them',
      'Start at your desk',
      'Update the hub only',
      'Build your own client',
      'Talk instead of type',
    ])
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument()
    expect(screen.getByText('Done: retries with backoff, 3 attempts')).toBeInTheDocument()
    expect(screen.getByText('Live · writing what you say')).toBeInTheDocument()
    expect(screen.getByText('Commands only')).toBeInTheDocument()
    expect(screen.getByText(/WS\s+\/v1\/stream/)).toBeInTheDocument()
  })
})
