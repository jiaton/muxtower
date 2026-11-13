import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FeatureClip } from './feature-clip'

describe('FeatureClip', () => {
  it('shows its poster, 16:9, and loads nothing until it is near the screen', () => {
    render(<FeatureClip id="live-list" label="Every agent, live" />)
    const video = screen.getByLabelText('Every agent, live') as HTMLVideoElement
    expect(video).toHaveAttribute('poster', '/clips/live-list.jpg')
    expect(video).toHaveClass('aspect-video')
    expect(video.muted).toBe(true)
    expect(video.getAttribute('src')).toBeNull()
  })
})
