import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { ConversationItem } from '@/lib/api/types'
import { ConversationView } from './conversation-view'

const item = (seq: number, kind: 'prompt' | 'reply', text: string) => ({ seq, kind, text, at: '2026-11-16T10:00:00Z' }) as ConversationItem

it('scrolls to the item a search led to, outlines it, and shows a long prompt whole', () => {
  const scrolled = vi.fn()
  Element.prototype.scrollIntoView = scrolled
  const long = [...Array(30)].map((_, i) => `line ${i}`).join('\n')
  render(<ConversationView items={[item(1, 'reply', 'first'), item(2, 'prompt', long), item(3, 'reply', 'last')]} focus={2} />)
  expect(scrolled).toHaveBeenCalled()
  const target = document.querySelector('[data-seq="2"]')!
  expect(target.querySelector('[data-clamped]')).toBeNull() // whole, not cut at eight lines
  expect(target.innerHTML).toMatch(/ring-accent/)
})

it('an earlier part says so, and goes back to the latest', () => {
  const back = vi.fn()
  render(<ConversationView items={[item(8, 'reply', 'old one')]} focus={8} earlier={back} />)
  expect(screen.getByText(/An earlier part of the conversation/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Back to the latest' }))
  expect(back).toHaveBeenCalled()
})
