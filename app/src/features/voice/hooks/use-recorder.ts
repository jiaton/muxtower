import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderState = 'idle' | 'starting' | 'recording'

/** Compact speech, in the first format the browser records: Opus (Chrome, Firefox), else MP4 (Safari). */
const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']
const BITS_PER_SECOND = 32_000 // ~240 KB a minute: plenty for speech, little to hold or send
export const MAX_SECONDS = 300

export const canRecord = () => typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia

interface Parts {
  recorder: MediaRecorder
  stream: MediaStream
  audio: AudioContext
  analyser: AnalyserNode
  samples: Uint8Array<ArrayBuffer>
  chunks: Blob[]
}

const refused = (e: unknown) =>
  e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
    ? 'Microphone access is blocked for this site.'
    : e instanceof DOMException && e.name === 'NotFoundError'
      ? 'No microphone found.'
      : 'Could not start the microphone.'

/** The microphone while asked to record, and how loud it is now (`level()`, 0..1, read when wanted:
 *  nothing renders per sample). The microphone and the audio graph are let go as soon as it stops,
 *  is cancelled or the page leaves. */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [error, setError] = useState<string | null>(null)
  const parts = useRef<Parts | null>(null)

  const release = useCallback(() => {
    const p = parts.current
    parts.current = null
    if (p) {
      p.stream.getTracks().forEach((t) => t.stop())
      void p.audio.close().catch(() => undefined)
    }
    setState('idle')
  }, [])
  useEffect(() => release, [release])

  const start = useCallback(async () => {
    if (parts.current) return
    setError(null)
    setState('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
      const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: BITS_PER_SECOND })
      const audio = new AudioContext()
      const analyser = audio.createAnalyser()
      analyser.fftSize = 256 // a level, not a spectrum: the smallest buffer that reads one
      audio.createMediaStreamSource(stream).connect(analyser)
      const p: Parts = { recorder, stream, audio, analyser, samples: new Uint8Array(analyser.fftSize), chunks: [] }
      recorder.ondataavailable = (e) => e.data.size && p.chunks.push(e.data)
      recorder.start()
      parts.current = p
      setState('recording')
    } catch (e) {
      release()
      setError(refused(e))
    }
  }, [release])

  /** Stops and hands over the recording (null when nothing was heard). */
  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const p = parts.current
        if (!p) return resolve(null)
        p.recorder.onstop = () => {
          const blob = new Blob(p.chunks, { type: p.recorder.mimeType || 'audio/webm' })
          p.chunks.length = 0
          release()
          resolve(blob.size ? blob : null)
        }
        p.recorder.stop()
      }),
    [release],
  )

  const cancel = useCallback(() => {
    const p = parts.current
    if (p && p.recorder.state !== 'inactive') {
      p.recorder.onstop = null
      p.recorder.stop()
    }
    release()
  }, [release])

  const level = useCallback(() => {
    const p = parts.current
    if (!p) return 0
    p.analyser.getByteTimeDomainData(p.samples)
    let sum = 0
    for (const s of p.samples) sum += (s - 128) ** 2
    return Math.min(1, Math.sqrt(sum / p.samples.length) / 40) // speech peaks around 30-50
  }, [])

  return { state, error, start, stop, cancel, level }
}
