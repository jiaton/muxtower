import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { ImageViewer } from './image-viewer'
import { VideoPlayer } from './video'

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
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
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

function VideoViewer() {
  const [index, setIndex] = useState<number | null>(0)
  return (
    <ImageViewer
      count={2}
      index={index}
      onIndexChange={setIndex}
      onClose={() => setIndex(null)}
      title={(i) => `Item ${i + 1}`}
      slide={(i) => (i === 0 ? <VideoPlayer src="blob:clip" label="clip.webm" /> : <img alt="slide 2" />)}
    />
  )
}

/** The player as laid out: 400 px tall from the top of the page. */
function placeVideo() {
  const video = screen.getByLabelText('clip.webm', { selector: 'video' })
  video.getBoundingClientRect = () => ({
    top: 0,
    bottom: 400,
    left: 0,
    right: 600,
    width: 600,
    height: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  return video
}

it('pauses a video it moves away from, by swipe, key or arrow, and on close', () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  render(<VideoViewer />)
  const video = placeVideo()
  fireEvent.pointerDown(video, { clientX: 400, clientY: 100, pointerId: 1 })
  fireEvent.pointerMove(video, { clientX: 250, clientY: 105, pointerId: 1 })
  fireEvent.pointerUp(video, { clientX: 250, clientY: 105, pointerId: 1 })
  expect(screen.getByText('2 / 2')).toBeInTheDocument() // a swipe on the picture still turns
  expect(pause).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
  expect(screen.getByText('1 / 2')).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(pause).toHaveBeenCalledTimes(2) // leaving slide 2 (no video there) paused nothing; closing on the video did
  pause.mockRestore()
})

it('leaves taps and drags on its controls to the player: no capture, no zoom, no swipe', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  render(<VideoViewer />)
  const video = placeVideo()
  const capture = vi.fn()
  screen.getByTestId('image-stage').setPointerCapture = capture
  for (let i = 0; i < 2; i++) {
    fireEvent.pointerDown(video, { clientX: 300, clientY: 200, pointerId: 1 })
    fireEvent.pointerUp(video, { clientX: 300, clientY: 200, pointerId: 1 })
  }
  expect(capture).not.toHaveBeenCalled() // a captured pointer's click would land on the stage, not the player
  expect((screen.getByTestId('image-stage').firstElementChild as HTMLElement).style.transform).toBe('') // no zoom
  fireEvent.pointerDown(video, { clientX: 400, clientY: 380, pointerId: 1 }) // on the controls: scrubbing
  fireEvent.pointerMove(video, { clientX: 100, clientY: 380, pointerId: 1 })
  fireEvent.pointerUp(video, { clientX: 100, clientY: 380, pointerId: 1 })
  expect(screen.getByText('1 / 2')).toBeInTheDocument()
  vi.restoreAllMocks()
})
