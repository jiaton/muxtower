import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Updates } from './updates'

describe('Updates', () => {
  it('says to update the hub alone', () => {
    render(<Updates />)
    expect(screen.getByText('pipx upgrade muxtower')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /The rest follow/ })).toBeInTheDocument()
  })
})
