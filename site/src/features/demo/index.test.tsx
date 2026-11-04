import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DemoShow } from '.'

describe('DemoShow', () => {
  it('shows the first beat and jumps to another on request', async () => {
    render(<DemoShow />)
    expect(screen.getByRole('region', { name: 'muxtower demo' })).toBeInTheDocument()
    expect(screen.getByText(/A NAS, a server, a VPS/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Team' }))
    expect(screen.getByRole('button', { name: 'Team' })).toHaveAttribute('aria-current', 'step')
  })
})
