import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { chooseLanguages, chosenLanguages, PACK, packDownloaded, removePack, type Language } from '../live/kws'

const LANGUAGES: { id: Language; label: string; words: string }[] = [
  { id: 'en', label: 'English', words: 'send, pause, resume, clear, undo' },
  { id: 'zh', label: '中文', words: '发送、暂停、继续、清空、撤回上一句' },
]

/** This browser's Live voice commands: the languages listened for, and the model they need (its size,
 *  whether it is downloaded, and removing it). */
export function VoiceCommandsSettings() {
  const [languages, setLanguages] = useState(chosenLanguages)
  const [downloaded, setDownloaded] = useState<boolean | null>(null)
  useEffect(() => void packDownloaded().then(setDownloaded), [])
  const toggle = (id: Language, on: boolean) => {
    const next = on ? [...new Set([...languages, id])] : languages.filter((l) => l !== id)
    if (!next.length) return // at least one
    setLanguages(next)
    chooseLanguages(next)
  }
  return (
    <section aria-labelledby="voice-commands" className="flex flex-col gap-2">
      <h2 id="voice-commands" className="text-sm font-medium">
        Voice commands in Live mode (this browser)
      </h2>
      <p className="text-sm text-fg-muted">
        Heard on this device, without uploading: say a command on its own. Changes apply the next time Live starts.
      </p>
      <ul className="flex flex-col gap-2">
        {LANGUAGES.map((l) => (
          <li key={l.id}>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={languages.includes(l.id)} onChange={(e) => toggle(l.id, e.target.checked)} aria-label={l.label} />
              <span>
                {l.label} <span className="text-fg-muted">· {l.words}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
        <span className="min-w-0 flex-1">
          {PACK.name} · {(PACK.bytes / 1e6).toFixed(1)} MB ·{' '}
          <span className="text-fg-muted">
            {downloaded === null ? '…' : downloaded ? 'downloaded' : 'downloaded when Live first starts'}
          </span>
        </span>
        {downloaded ? (
          <Button variant="ghost" size="sm" onClick={() => void removePack().then(() => setDownloaded(false))}>
            <Trash2 /> Remove
          </Button>
        ) : null}
      </div>
    </section>
  )
}
