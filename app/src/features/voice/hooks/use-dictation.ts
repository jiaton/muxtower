import { useCallback } from 'react'
import { useTranscribe } from '../api/use-transcribe'
import { canRecord, useRecorder } from './use-recorder'

/** Speaking a message: record, then the daemon's speech to text, whose words go to `onText` (into the
 *  message box, to read before sending). `enabled`: the daemon has speech to text. */
export function useDictation(daemonId: string, enabled: boolean, onText: (text: string) => void) {
  const recorder = useRecorder()
  const transcribe = useTranscribe(daemonId)
  const finish = useCallback(async () => {
    const audio = await recorder.stop()
    if (audio) transcribe.mutate(audio, { onSuccess: (text) => text && onText(text) })
  }, [recorder, transcribe, onText])
  return {
    available: enabled && canRecord(),
    active: recorder.state !== 'idle' || transcribe.isPending,
    transcribing: transcribe.isPending,
    error: recorder.error ?? transcribe.error?.message ?? null,
    start: recorder.start,
    cancel: recorder.cancel,
    finish,
    level: recorder.level,
  }
}

export type Dictation = ReturnType<typeof useDictation>
