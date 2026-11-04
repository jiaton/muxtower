import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { questions } from '@/content/faq'
import { Faq } from './faq'

describe('Faq', () => {
  it('opens an answer', async () => {
    render(<Faq />)
    await userEvent.click(screen.getByRole('button', { name: questions.find((q) => q.q.startsWith('Why not just SSH'))!.q }))
    expect(screen.getByText(/one machine at a time/)).toBeVisible()
  })
})
