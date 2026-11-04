import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './app'
import { nav } from './content/page'

describe('App', () => {
  it('has a section for every nav link', () => {
    const { container } = render(<App />)
    for (const { href } of nav) expect(container.querySelector(href)).not.toBeNull()
  })
})
