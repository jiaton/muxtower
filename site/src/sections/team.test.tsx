import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Team } from './team'

describe('Team', () => {
  it('shows my_team and send_task as an agent sees them', () => {
    render(<Team />)
    expect(screen.getByRole('heading', { name: /team/ })).toBeInTheDocument()
    expect(screen.getByText(/Your team \(1 other session/)).toBeInTheDocument()
    expect(screen.getByText(/^Delivered to shop/)).toBeInTheDocument()
  })
})
