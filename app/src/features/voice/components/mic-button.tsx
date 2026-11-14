import { Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Dictation } from '../hooks/use-dictation'
import { keepFocus } from '@/components/ui/gesture'

/** Starts speaking a message. */
export function MicButton({ dictation }: { dictation: Dictation }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0"
      aria-label="Speak"
      title="Speak: your words go into the message box"
      onPointerDown={keepFocus} // keep the phone keyboard as it is
      onClick={() => void dictation.start()}
    >
      <Mic />
    </Button>
  )
}
