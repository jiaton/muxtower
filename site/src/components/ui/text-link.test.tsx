import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TextLink } from './text-link'

describe('TextLink', () => {
  it('is a plain link with its look and the layout it is given', () => {
    render(
      <TextLink look="nav" href="#faq" className="flex">
        FAQ
      </TextLink>,
    )
    const link = screen.getByRole('link', { name: 'FAQ' })
    expect(link).toHaveAttribute('href', '#faq')
    expect(link).toHaveClass('hover:text-foreground', 'flex')
  })
})
