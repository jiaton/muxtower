import { expect, it } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { mediaProblem } from './media-state'

it('says why a picture or video cannot show, by the status the daemon answered', () => {
  const as = (status: number, shown = false) => mediaProblem(new ApiError(status, 'no'), shown)
  expect(as(404)).toBe('hidden') // never shown: the daemon does not show it
  expect(as(404, true)).toBe('gone') // it showed, and is no longer there
  expect(as(410)).toBe('gone')
  expect(as(413)).toBe('tooLarge')
  expect(as(415)).toBe('hidden')
  expect(as(409)).toBe('unreachable')
  expect(as(500)).toBe('failed')
  expect(mediaProblem(new TypeError('Failed to fetch'), false)).toBe('failed')
})
