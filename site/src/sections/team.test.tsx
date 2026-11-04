import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Team } from './team'

describe('Team', () => {
  it('says what a team is, beside a real one at work', () => {
    render(<Team />)
    expect(screen.getByRole('heading', { name: /team/ })).toBeInTheDocument()
    expect(screen.getByText('A role is plain text: pm, worker, reviewer.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'acme/shop' })).toBeInTheDocument()
  })
})
