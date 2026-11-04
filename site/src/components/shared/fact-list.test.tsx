import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FactList } from './fact-list'

describe('FactList', () => {
  it('lists each fact, code spans as code', () => {
    render(<FactList facts={['Run `muxtower pair`.', 'Another.']} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('muxtower pair').tagName).toBe('CODE')
  })
})
