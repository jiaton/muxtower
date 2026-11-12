import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { failed, useDictation } from './use-dictation'

it('says why a transcription failed', () => {
  expect(failed(new ApiError(503, 'groq answered HTTP 400: prompt too long'))).toBe(
    'Transcription failed: groq answered HTTP 400: prompt too long',
  )
  expect(failed(new ApiError(502, undefined, true))).toBe('Transcription failed: something in front of the daemon answered 502')
  expect(failed(new TypeError('Failed to fetch'))).toBe('Transcription failed: the daemon could not be reached')
})

const recorder = vi.hoisted(() => ({ stop: vi.fn(), start: vi.fn(), cancel: vi.fn(), state: 'recording', error: null, level: 0 }))
const mutation = vi.hoisted(() => ({ calls: [] as ((text: string) => void)[] }))
vi.mock('./use-recorder', () => ({ useRecorder: () => recorder, canRecord: () => true }))
vi.mock('../api/use-transcribe', () => ({
  useTranscribe: () => ({
    mutate: (_audio: Blob, { onSuccess }: { onSuccess: (text: string) => void }) => mutation.calls.push(onSuccess),
    reset: () => {},
    isPending: false,
    error: null,
  }),
}))

it('writes what one recording said once, however often Stop is pressed or its answer comes', async () => {
  let release!: (blob: Blob) => void
  recorder.stop.mockImplementation(() => new Promise<Blob>((resolve) => (release = resolve)))
  const onText = vi.fn()
  const { result } = renderHook(() => useDictation('hub', true, onText))
  let first!: Promise<void>
  act(() => {
    first = result.current.finish()
    void result.current.finish() // pressed again while it stops
  })
  await act(async () => {
    release(new Blob(['fake audio']))
    await first
  })
  expect(mutation.calls).toHaveLength(1) // one upload
  act(() => {
    mutation.calls[0]!('ship the release notes')
    mutation.calls[0]!('ship the release notes') // its answer handed over twice
  })
  expect(onText).toHaveBeenCalledTimes(1)
  expect(onText).toHaveBeenCalledWith('ship the release notes')
})
