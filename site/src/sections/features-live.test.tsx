import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LivePicture } from './features-live'

describe('LivePicture', () => {
  it('draws both of the app’s Live rows, with what each hears and answers', () => {
    render(<LivePicture />)
    for (const text of [
      'Live · speak to write',
      'Live · hearing you…',
      'Live · writing…',
      'Commands only',
      '✓ sent',
      '✓ paused',
      'Write again',
    ])
      expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getAllByText('Run the migration on staging')).toHaveLength(2) // in the box, then sent
  })

  it('echoes nothing of what was written and hides the details setting’s “(on device)”', () => {
    const { container } = render(<LivePicture />)
    expect(container.textContent).not.toMatch(/added:|on device\)/)
  })

  it('is a picture: nothing in it can be focused', () => {
    const { container } = render(<LivePicture />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden')
    for (const button of container.querySelectorAll('button')) expect(button).toHaveAttribute('tabindex', '-1')
  })
})
