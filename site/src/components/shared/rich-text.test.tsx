import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RichText } from './rich-text'

describe('RichText', () => {
  it('renders backticks as code and leaves the rest as text', () => {
    const { container } = render(<RichText text="Call `my_team` first, then `send_task`." />)
    expect([...container.querySelectorAll('code')].map((c) => c.textContent)).toEqual(['my_team', 'send_task'])
    expect(container.textContent).toBe('Call my_team first, then send_task.')
  })
})
