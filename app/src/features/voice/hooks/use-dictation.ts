import { useCallback, useRef, useState } from 'react'
import { ApiError } from '@/lib/api/client'
import { useTranscribe } from '../api/use-transcribe'
import { canRecord, useRecorder } from './use-recorder'

/** Speaking a message: record, then the daemon's speech to text, whose words go to `onText` (into the
 *  message box, to read before sending). `enabled`: the daemon has speech to text. */
export function useDictation(daemonId: string, enabled: boolean, onText: (text: string) => void) {
  const recorder = useRecorder()
  const transcribe = useTranscribe(daemonId)
  const [heard, setHeard] = useState<string | null>(null) // why nothing came back, when nothing did
  const finishing = useRef(false)
  const written = useRef(new Set<number>())
  const recordings = useRef(0)
  /** Stops and writes what was said: once per recording, however often Stop is pressed meanwhile. */
  const finish = useCallback(async () => {
    if (finishing.current) return
    finishing.current = true
    setHeard(null)
    const recording = ++recordings.current
    try {
      const audio = await recorder.stop()
      if (audio)
        transcribe.mutate(audio, {
          onSuccess: (text) => {
            if (written.current.has(recording)) return
            written.current.add(recording)
            if (text) onText(text)
            else setHeard('Heard nothing: try again, a little closer.')
          },
        })
    } finally {
      finishing.current = false
    }
  }, [recorder, transcribe, onText])
  const start = useCallback(() => {
    setHeard(null)
    transcribe.reset()
    return recorder.start()
  }, [recorder, transcribe])
  return {
    available: enabled && canRecord(),
    active: recorder.state !== 'idle' || transcribe.isPending,
    transcribing: transcribe.isPending,
    error: recorder.error ?? (transcribe.error ? failed(transcribe.error) : heard),
    start,
    cancel: recorder.cancel,
    finish,
    level: recorder.level,
  }
}

export type Dictation = ReturnType<typeof useDictation>

/** Why the recording did not become words: the daemon's reason, or that it could not be reached. */
export function failed(error: Error) {
  const reason =
    error instanceof TypeError
      ? 'the daemon could not be reached'
      : error instanceof ApiError && error.message.startsWith('request failed')
        ? `something in front of the daemon answered ${error.status}`
        : error.message
  return `Transcription failed: ${reason}`
}
