import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Assistant } from './assistant'

describe('Assistant', () => {
  it('shows a talk with the concierge', () => {
    render(<Assistant />)
    expect(screen.getByRole('heading', { name: /One assistant/ })).toBeInTheDocument()
    expect(screen.getByText(/^\[muxtower event #14/)).toBeInTheDocument()
  })
})
