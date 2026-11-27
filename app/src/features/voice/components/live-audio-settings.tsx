import { Checkbox } from '@/components/ui/checkbox'
import { ink } from '@/components/ui/intents'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { useLiveAudio, type MicSource, type NextTrack } from '../live/audio-prefs'
import { useAudioStatus, type AudioStatus } from '../live/status'
import { useCallRoute } from '../live/call-audio'

const SOURCES: { value: MicSource; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'phone', label: 'Phone microphone' },
  { value: 'bluetooth', label: 'Bluetooth / car microphone' },
]

/** This browser's Live audio, for a phone on a car's Bluetooth: the microphone, voice processing, what a
 *  car's ⏭ does while Read aloud is on, and a line saying what is in use now. */
export function LiveAudioSettings() {
  const { mic, processing, nextTrack, callAudio, setMic, setProcessing, setNextTrack, setCallAudio } = useLiveAudio()
  return (
    <section aria-labelledby="live-audio" className="flex flex-col gap-3">
      <h2 id="live-audio" className={ink.label}>
        Live in the car (this browser)
      </h2>
      <p className={ink.hint}>For a phone on a car's Bluetooth. Changes apply the next time Live starts.</p>
      <Label>
        Microphone
        <Select value={mic} onChange={(e) => setMic(e.target.value as MicSource)}>
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Label>
      <label className={`${ink.body} flex items-start gap-2`}>
        <Checkbox checked={processing} onChange={(e) => setProcessing(e.target.checked)} aria-label="Voice processing" />
        <span>
          Voice processing{' '}
          <span className={ink.quiet}>
            · echo cancellation, noise suppression, auto gain. Off, the phone may stay on the car's media instead of a call, but more of the
            car's own sound is picked up (Read aloud never reaches the microphone: Live does not listen while it speaks).
          </span>
        </span>
      </label>
      <label className={`${ink.body} flex items-start gap-2`}>
        <Checkbox checked={callAudio} onChange={(e) => setCallAudio(e.target.checked)} aria-label="In Live, play read-aloud through the call audio" />
        <span>
          In Live, play read-aloud through the call audio{' '}
          <span className={ink.quiet}>
            · the phone stays in hands-free (call) mode while Live is on, and what is read aloud plays on the call's volume and route. Off, as
            before: read-aloud plays as media, the phone leaving call mode while it speaks, and the car's media buttons work during Live.
          </span>
        </span>
      </label>
      <div className="flex flex-col gap-1.5">
        <span className={ink.body}>The car's ⏭ button, while Live and Read aloud are on (when read-aloud plays as media)</span>
        <Segmented<NextTrack>
          aria-label="The car's next button"
          value={nextTrack}
          options={[
            { value: 'read', label: 'Read all' },
            { value: 'send', label: 'Send' },
          ]}
          onChange={setNextTrack}
        />
      </div>
      <LiveAudioNow />
    </section>
  )
}

/** What Live's audio is doing now, updated as it changes. */
export function LiveAudioNow() {
  const status = useAudioStatus()
  const call = useCallRoute((s) => s.open)
  return (
    <p role="status" aria-label="Live audio now" className={ink.meta}>
      {nowLine(status, call)}
    </p>
  )
}

export function nowLine(s: AudioStatus, call = false): string {
  const held = s.handlers ? `media controls held${s.loop === 'blocked' ? ' (the silent loop was blocked)' : ''}` : 'media controls not held'
  if (!s.input) return `Now: Live is off · ${held}`
  const processing = s.processing === null ? 'voice processing unknown' : `voice processing ${s.processing ? 'on' : 'off'}`
  const route = call ? 'read-aloud through the call audio' : 'read-aloud as media'
  return `Now: ${s.input}${s.note ? ` (${s.note})` : ''} · ${processing} · ${route} · ${held}`
}
