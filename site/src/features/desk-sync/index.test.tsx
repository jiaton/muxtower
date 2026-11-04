import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DeskSync } from '.'

describe('DeskSync', () => {
  it('shows one desktop session in the app and on the phone, answered from the phone', () => {
    render(<DeskSync />)
    expect(screen.getAllByText('Release notes 2.4')).toHaveLength(2)
    expect(screen.getByText('Claude desktop app · macbook')).toBeInTheDocument()
    expect(screen.getByText('muxtower · your phone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument()
    expect(screen.getByText(/· allowed$/)).toBeInTheDocument()
  })
})
