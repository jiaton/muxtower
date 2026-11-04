import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from './footer'

describe('Footer', () => {
  it('links to PyPI and says the license', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'PyPI' })).toHaveAttribute('href', 'https://pypi.org/project/muxtower/')
    expect(screen.getByText(/Apache-2.0/)).toBeInTheDocument()
  })
})
