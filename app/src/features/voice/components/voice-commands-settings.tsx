import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { liveDetails, setLiveDetails } from '../live/feedback'
import { chooseLanguages, chosenLanguages, PACK, packDownloaded, removePack, type Language } from '../live/kws'
import { PACKS } from '../live/packs'
import { ink, look } from '@/components/ui/intents'

// Each language's commands, as its pack says them.
const LANGUAGES = PACKS.map((p) => ({ id: p.id, label: p.name, words: Object.values(p.say).join(', ') }))

/** This browser's Live voice commands: the languages listened for, and the model they need (its size,
 *  whether it is downloaded, and removing it). */
export function VoiceCommandsSettings() {
  const [languages, setLanguages] = useState(chosenLanguages)
  const [downloaded, setDownloaded] = useState<boolean | null>(null)
  const [details, setDetails] = useState(liveDetails)
  useEffect(() => void packDownloaded().then(setDownloaded), [])
  const toggle = (id: Language, on: boolean) => {
    const next = on ? [...new Set([...languages, id])] : languages.filter((l) => l !== id)
    if (!next.length) return // at least one
    setLanguages(next)
    chooseLanguages(next)
  }
  return (
    <section aria-labelledby="voice-commands" className="flex flex-col gap-2">
      <h2 id="voice-commands" className={ink.label}>
        Voice commands in Live mode (this browser)
      </h2>
      <p className={ink.hint}>
        Heard on this device, without uploading: say a command on its own. Changes apply the next time Live starts.
      </p>
      <ul className="flex flex-col gap-2">
        {LANGUAGES.map((l) => (
          <li key={l.id}>
            <label className={`${ink.body} flex items-start gap-2`}>
              <Checkbox checked={languages.includes(l.id)} onChange={(e) => toggle(l.id, e.target.checked)} aria-label={l.label} />
              <span>
                {l.label} <span className={ink.quiet}>· {l.words}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className={`${ink.body} ${look.frame} flex flex-wrap items-center gap-2 px-3 py-2`}>
        <span className="min-w-0 flex-1">
          {PACK.name} · {(PACK.bytes / 1e6).toFixed(1)} MB ·{' '}
          <span className={ink.quiet}>{downloaded === null ? '…' : downloaded ? 'downloaded' : 'downloaded when Live first starts'}</span>
        </span>
        {downloaded ? (
          <Button variant="ghost" size="sm" onClick={() => void removePack().then(() => setDownloaded(false))}>
            <Trash2 /> Remove
          </Button>
        ) : null}
      </div>
      <label className={`${ink.body} flex items-start gap-2`}>
        <Checkbox
          checked={details}
          onChange={(e) => {
            setDetails(e.target.checked)
            setLiveDetails(e.target.checked)
          }}
          aria-label="Show Live details"
        />
        <span>
          Show Live details{' '}
          <span className={ink.quiet}>
            · how each command was heard, short transcripts that were no command, and why something was ignored
          </span>
        </span>
      </label>
    </section>
  )
}
