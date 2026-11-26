import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { VideoPlayer, VideoThumb } from './video'

it('a thumbnail is the first frame, still and silent, with a play mark over it', () => {
  const { container } = render(<VideoThumb src="blob:clip" />)
  const video = container.querySelector('video')!
  expect(video.getAttribute('src')).toBe('blob:clip#t=0.1') // a frame to show before it plays
  expect(video.muted).toBe(true)
  expect(video.controls).toBe(false)
  expect(video.autoplay).toBe(false)
  expect(video.getAttribute('preload')).toBe('metadata')
  expect(video).toHaveAttribute('aria-hidden')
  expect(container.querySelector('[data-play-badge]')).not.toBeNull()
})

it('a thumbnail waiting for its file is the play mark alone', () => {
  const { container } = render(<VideoThumb />)
  expect(container.querySelector('video')).toBeNull()
  expect(container.querySelector('[data-play-badge]')).not.toBeNull()
})

it('the player is the browser’s own, inline, never playing on its own', () => {
  render(<VideoPlayer src="blob:clip" label="clip.webm" />)
  const video = screen.getByLabelText('clip.webm') as HTMLVideoElement
  expect(video.controls).toBe(true)
  expect(video.autoplay).toBe(false)
  expect(video.hasAttribute('playsinline')).toBe(true)
  expect(video.getAttribute('preload')).toBe('metadata')
  expect(video.getAttribute('src')).toBe('blob:clip#t=0.1')
})
