import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Cursor } from './cursor'

describe('Cursor', () => {
  it('is drawn, hidden from assistive tech, with or without a target', () => {
    const { container, rerender } = render(<Cursor box={null} pressed={false} />)
    expect(container.querySelector('[aria-hidden] svg')).not.toBeNull()
    rerender(<Cursor box={{ x: 10, y: 20, width: 40, height: 20 }} pressed />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
