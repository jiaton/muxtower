import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Usage } from './usage'

describe('Usage', () => {
  it('lists every machine and says which is over a limit, and why', () => {
    render(<Usage />)
    expect(screen.getAllByRole('row')).toHaveLength(6)
    expect(screen.getByLabelText('Over a limit')).toBeInTheDocument()
    expect(screen.getByText(/slowest: rule tool-permission/)).toBeInTheDocument()
  })
})
