import { expect, it } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { failed } from './use-dictation'

it('says why a transcription failed', () => {
  expect(failed(new ApiError(503, 'groq answered HTTP 400: prompt too long'))).toBe(
    'Transcription failed: groq answered HTTP 400: prompt too long',
  )
  expect(failed(new ApiError(502, undefined, true))).toBe('Transcription failed: something in front of the daemon answered 502')
  expect(failed(new TypeError('Failed to fetch'))).toBe('Transcription failed: the daemon could not be reached')
})
