import { expect, it } from 'vitest'
import { mediaKind } from './media'

it('tells pictures and videos by media type first, else by extension', () => {
  expect(mediaKind('/tmp/a.PNG')).toBe('image')
  expect(mediaKind('/tmp/clip.mp4')).toBe('video')
  expect(mediaKind('demo.webm')).toBe('video')
  expect(mediaKind('notes.pdf')).toBeNull()
  expect(mediaKind('noext')).toBeNull()
  expect(mediaKind('clip.mp4', 'application/pdf')).toBeNull() // the type wins
  expect(mediaKind('anything', 'video/webm; codecs=vp9')).toBe('video')
  expect(mediaKind('anything', 'video/quicktime')).toBeNull() // not every browser plays it
})
