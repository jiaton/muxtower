import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Section, SectionHeading } from './section'

describe('Section', () => {
  it('is an anchored band with a heading', () => {
    const { container } = render(
      <Section id="x">
        <SectionHeading eyebrow="Hub" title="Title" lead="Lead with `code`." />
      </Section>,
    )
    expect(container.querySelector('section#x [data-reveal]')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Title' })).toBeInTheDocument()
    expect(screen.getByText('Hub')).toBeInTheDocument()
    expect(screen.getByText('code').tagName).toBe('CODE')
  })

  it('has a dark tone for the one ink band', () => {
    const { container } = render(
      <Section id="y" tone="ink">
        x
      </Section>,
    )
    expect(container.querySelector('section#y')).toHaveClass('bg-ink')
  })
})
