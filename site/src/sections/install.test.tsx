import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Install } from './install'

describe('Install', () => {
  it('switches between Tailscale and your own domain', async () => {
    render(<Install />)
    expect(screen.getByText('muxtower expose tailscale')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Your own domain' }))
    expect(screen.getByText('muxtower pair --url https://muxtower.example.com')).toBeInTheDocument()
  })
})
