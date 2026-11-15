import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { ImageViewer } from './image-viewer'

function Viewer({ onPage }: { onPage?: () => void }) {
  const [index, setIndex] = useState<number | null>(1)
  return (
    <div onPointerDown={onPage} onPointerUp={onPage}>
      <ImageViewer
        count={3}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
        title={(i) => `Picture ${i + 1}`}
        slide={(i) => <img alt={`slide ${i + 1}`} />}
      />
    </div>
  )
}

it('steps with the arrow keys and says where it is, at either end staying put', () => {
  render(<Viewer />)
  expect(screen.getByText('2 / 3')).toBeInTheDocument()
  const dialog = screen.getByRole('dialog')
  fireEvent.keyDown(dialog, { key: 'ArrowRight' })
  expect(screen.getByAltText('slide 3')).toBeInTheDocument()
  fireEvent.keyDown(dialog, { key: 'ArrowRight' }) // the last: stays
  expect(screen.getByText('3 / 3')).toBeInTheDocument()
  fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
  fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
  expect(screen.getByText('1 / 3')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next picture' }))
  expect(screen.getByText('2 / 3')).toBeInTheDocument()
})

it('goes on with a swipe, which never reaches the page under it, and closes on Esc', () => {
  const page = vi.fn()
  render(<Viewer onPage={page} />)
  const stage = screen.getByTestId('image-stage')
  fireEvent.pointerDown(stage, { clientX: 300, clientY: 100, pointerId: 1 })
  fireEvent.pointerMove(stage, { clientX: 150, clientY: 110, pointerId: 1 })
  fireEvent.pointerUp(stage, { clientX: 150, clientY: 110, pointerId: 1 })
  expect(screen.getByText('3 / 3')).toBeInTheDocument() // swiped left: the next
  expect(page).not.toHaveBeenCalled() // the Pager (views) never saw it
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('zooms in on a double tap, and out on another', () => {
  render(<Viewer />)
  const stage = screen.getByTestId('image-stage')
  const tap = () => {
    fireEvent.pointerDown(stage, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 100, clientY: 100, pointerId: 1 })
  }
  tap()
  tap()
  expect((stage.firstElementChild as HTMLElement).style.transform).toContain('scale(2)')
  tap()
  tap()
  expect((stage.firstElementChild as HTMLElement).style.transform).toBe('')
})
