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
      'Reply without the mouse',
    ])
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument()
    expect(screen.getByText('Done: retries with backoff, 3 attempts')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Live: speaking/)).toHaveAttribute('poster', '/clips/live-voice.jpg')
    expect(screen.getByLabelText(/on the live terminal$/)).toHaveAttribute('poster', '/clips/keyboard-flow.jpg')
    expect(screen.getByText(/WS\s+\/v1\/stream/)).toBeInTheDocument()
  })

  it('says in a few points what sets Live apart', () => {
    render(<Features />)
    for (const point of ['Follows you from session to session', 'Silence uploads nothing'])
      expect(screen.getByText(point)).toBeInTheDocument()
  })
})
