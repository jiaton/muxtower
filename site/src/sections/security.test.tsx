import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Security } from './security'

describe('Security', () => {
  it('states the lock, and leaves the policy link out without a repository', () => {
    render(<Security />)
    expect(screen.getByText('A token per device')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /security model/ })).toBeNull()
  })
})
