import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Hub } from './hub'

describe('Hub', () => {
  it('shows how a machine joins the hub', () => {
    render(<Hub />)
    expect(screen.getByRole('heading', { name: /One hub/ })).toBeInTheDocument()
    expect(screen.getByText('muxtower pair --join https://hub.example --code K7QM-3XPA')).toBeInTheDocument()
  })
})
