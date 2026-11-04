import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Spotlight } from './spotlight'

describe('Spotlight', () => {
  it('frames the target with its note', () => {
    render(<Spotlight box={{ x: 100, y: 200, width: 80, height: 40 }} note="Uses `send_task`" />)
    expect(screen.getByText('send_task').tagName).toBe('CODE')
  })

  it('is gone without a target', () => {
    const { container } = render(<Spotlight box={null} note="x" />)
    expect(container).toBeEmptyDOMElement()
  })
})
