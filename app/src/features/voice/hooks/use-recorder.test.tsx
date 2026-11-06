import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRecorder } from './use-recorder'

const stopped = vi.fn()
const closed = vi.fn()

class FakeRecorder {
  static isTypeSupported = (type: string) => type === 'audio/mp4'
  mimeType: string
  state = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(_: MediaStream, options: { mimeType: string }) {
    this.mimeType = options.mimeType
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob([new Uint8Array(500)]) })
    this.onstop?.()
  }
}

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal(
    'AudioContext',
    class {
      createAnalyser = () => ({ fftSize: 0, getByteTimeDomainData: (a: Uint8Array) => a.fill(168) })
      createMediaStreamSource = () => ({ connect: () => undefined })
      close = () => (closed(), Promise.resolve())
    },
  )
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop: stopped }] }) },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  stopped.mockClear()
  closed.mockClear()
})

it('records in a format the browser has, hands the recording over and lets the microphone go', async () => {
  const { result } = renderHook(() => useRecorder())
  await act(() => result.current.start())
  expect(result.current.state).toBe('recording')
  expect(result.current.level()).toBe(1) // loud: 40 off the middle
  let audio: Blob | null = null
  await act(async () => {
    audio = await result.current.stop()
  })
  expect(audio!.type).toBe('audio/mp4')
  expect(audio!.size).toBe(500)
  expect([result.current.state, stopped.mock.calls.length, closed.mock.calls.length]).toEqual(['idle', 1, 1])
})

it('lets the microphone go when cancelled or left, and says when it is blocked', async () => {
  const { result, unmount } = renderHook(() => useRecorder())
  await act(() => result.current.start())
  act(() => result.current.cancel())
  expect(stopped).toHaveBeenCalledTimes(1)
  await act(() => result.current.start())
  unmount()
  expect(stopped).toHaveBeenCalledTimes(2)

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => Promise.reject(new DOMException('no', 'NotAllowedError')) },
  })
  const blocked = renderHook(() => useRecorder())
  await act(() => blocked.result.current.start())
  expect(blocked.result.current.error).toBe('Microphone access is blocked for this site.')
})

it('Done while the microphone is still starting waits for it, then hands the recording over', async () => {
  let grant: (stream: unknown) => void = () => undefined
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: () => new Promise((resolve) => (grant = resolve)) },
  })
  const { result } = renderHook(() => useRecorder())
  let started: Promise<void> = Promise.resolve()
  act(() => void (started = result.current.start()))
  expect(result.current.state).toBe('starting')
  let blob: Blob | null = null
  const stopping = result.current.stop().then((b) => (blob = b))
  await act(async () => {
    grant({ getTracks: () => [{ stop: stopped }] })
    await started
    await stopping
  })
  expect(blob).not.toBeNull()
  expect(result.current.state).toBe('idle')
  expect(stopped).toHaveBeenCalled()
})

it('says so when nothing was recorded', async () => {
  vi.stubGlobal(
    'MediaRecorder',
    class extends FakeRecorder {
      stop() {
        this.state = 'inactive'
        this.onstop?.()
      }
    },
  )
  const { result } = renderHook(() => useRecorder())
  await act(() => result.current.start())
  let blob: Blob | null = new Blob()
  await act(async () => void (blob = await result.current.stop()))
  expect(blob).toBeNull()
  expect(result.current.error).toMatch(/Nothing was recorded/)
})

it('says the microphone is blocked when the browser refuses it', async () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: () => Promise.reject(new DOMException('no', 'NotAllowedError')) },
  })
  const { result } = renderHook(() => useRecorder())
  await act(() => result.current.start())
  expect(result.current.error).toMatch(/Microphone access is blocked/)
  expect(result.current.state).toBe('idle')
})
