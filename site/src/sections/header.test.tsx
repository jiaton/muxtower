import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Header } from './header'

describe('Header', () => {
  it('links to the sections and to installing', () => {
    render(<Header />)
    expect(screen.getByRole('link', { name: 'Teams' })).toHaveAttribute('href', '#team')
    for (const link of screen.getAllByRole('link', { name: 'Install' })) expect(link).toHaveAttribute('href', '#install')
  })
})
