import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Hub } from './hub'

describe('Hub', () => {
  it('says how machines reach the hub, and draws it', () => {
    render(<Hub />)
    expect(screen.getByRole('heading', { name: /One hub/ })).toBeInTheDocument()
    expect(screen.getByText('HTTPS, not SSH')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /dial out to the hub/ })).toBeInTheDocument()
  })
})
