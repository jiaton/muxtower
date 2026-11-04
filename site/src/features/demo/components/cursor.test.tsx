import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Cursor } from './cursor'

describe('Cursor', () => {
  it('is drawn, hidden from assistive tech, whether or not it has a target', () => {
    const stage = { current: document.createElement('div') }
    const { container, rerender } = render(<Cursor stage={stage} target={null} scale={1} revision={0} pressed={false} />)
    expect(container.querySelector('[aria-hidden] svg')).not.toBeNull()
    rerender(<Cursor stage={stage} target="missing" scale={1} revision={1} pressed />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
