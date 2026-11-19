import { Square, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { playSession, stopPlaying } from '../live/play'
import { useSpeech } from '../live/speech'
import { ReadAloudCaption } from './read-aloud-caption'

/**
 * Play, in a session's header, Live on or off: its latest reply's spoken summary, said in the hub's voice
 * (or the phone's), with the caption and the phone's media controls. The summary is made only on this
 * press (the hub keeps it per reply: a second press costs nothing). While it is asked for or said, the same
 * button stops it. Shown only once the session has a reply.
 */
export function PlayButton({
  daemonId,
  sessionId,
  reply,
  name,
}: {
  daemonId: string
  sessionId: string
  reply: string | null
  name: string
}) {
  const key = `${daemonId}/${sessionId}`
  const reading = useSpeech((s) => s.asking === key || (s.speaking && s.front?.key === key))
  if (!reply) return null
  const label = reading ? 'Stop reading' : 'Read the last reply aloud'
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      tone={reading ? 'accent' : undefined}
      aria-label={label}
      title={reading ? 'Stop reading' : 'Read the last reply aloud: a short spoken summary'}
      onClick={() => (reading ? stopPlaying() : void playSession({ daemonId, sessionId, name, reply }))}
    >
      {reading ? <Square /> : <Volume2 />}
    </Button>
  )
}

/** Where what is read aloud shows: a line at the bottom of the session page, the caption floating above it
 *  (out of the flow: nothing moves). */
export function ReadAloudDock() {
  return (
    <div className="relative">
      <ReadAloudCaption />
    </div>
  )
}
