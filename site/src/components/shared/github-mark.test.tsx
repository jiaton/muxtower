import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GithubMark } from './github-mark'

describe('GithubMark', () => {
  it('is decorative', () => {
    const { container } = render(<GithubMark />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden')
  })
})
