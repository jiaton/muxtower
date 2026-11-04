import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Stage } from './stage'

describe('Stage', () => {
  it('draws the desktop window and the phone before it is measured', () => {
    const { container } = render(<Stage t={0} />)
    expect(container.querySelector('[data-demo="nav-devices"]')).not.toBeNull()
    expect(container.textContent).toContain('9:41')
  })

  it('shows the hub map at the end', () => {
    const { getByText } = render(<Stage t={44000} />)
    expect(getByText(/lists all/)).toBeInTheDocument()
  })
})
