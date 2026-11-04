import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Section, SectionHeading } from './section'

describe('Section', () => {
  it('is an anchored band with a heading', () => {
    const { container } = render(
      <Section id="x">
        <SectionHeading label="01" title="Title" lead="Lead with `code`." />
      </Section>,
    )
    expect(container.querySelector('section#x')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Title' })).toBeInTheDocument()
    expect(screen.getByText('code').tagName).toBe('CODE')
  })
})
