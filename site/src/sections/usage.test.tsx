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

describe('Usage figures', () => {
  it('pairs every figure with the sentence that explains it', () => {
    render(<Usage />)
    expect(screen.getByText('111 B')).toBeInTheDocument()
    expect(screen.getByText(/not the whole 8.9 KB screen/)).toBeInTheDocument()
    expect(screen.getAllByRole('term')).toHaveLength(5)
  })
})
