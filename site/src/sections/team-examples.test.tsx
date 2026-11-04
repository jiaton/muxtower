import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TeamExamples } from './team-examples'

describe('TeamExamples', () => {
  it('shows one project’s team and its work, and switches project', async () => {
    render(<TeamExamples />)
    expect(screen.getByText(/Customers keep asking for Apple Pay/)).toBeInTheDocument()
    expect(screen.getByText('@macbook')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'acme/api' }))
    expect(screen.getByText(/p99 latency doubled/)).toBeInTheDocument()
  })
})
