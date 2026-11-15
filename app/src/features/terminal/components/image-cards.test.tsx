import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Attachment } from '../images'
import { ImageCards } from './image-cards'

const items = [
  { id: 'a', preview: 'blob:a' },
  { id: 'b', preview: 'blob:b' },
] as unknown as Attachment[]

it('shows an attached picture large on a tap, steps to the next, and keeps its remove', () => {
  const remove = vi.fn()
  render(<ImageCards items={items} onRemove={remove} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show picture 1' }))
  expect(screen.getByText('1 / 2')).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
  expect(screen.getByText('2 / 2')).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: 'Remove picture 2' }))
  expect(remove).toHaveBeenCalledWith('b')
})
