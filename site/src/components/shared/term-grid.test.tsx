import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TermGrid } from './term-grid'

describe('TermGrid', () => {
  it('is a definition list of names and sentences', () => {
    render(<TermGrid items={[{ title: 'Voice', text: 'Dictate a reply.' }]} />)
    expect(screen.getByText('Voice').tagName).toBe('DT')
    expect(screen.getByText('Dictate a reply.').closest('dd')).not.toBeNull()
  })
})
