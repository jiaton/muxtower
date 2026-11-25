import { Button } from '@/components/ui/button'
import { chip } from '@/components/ui/chip'
import { ink } from '@/components/ui/intents'
import { shortFolderNames } from '../model/facets'
import type { NewSessionPlace } from '../model/new-here'

/** The folders "New session here" offers when its agent works somewhere other than where it started: each a
 *  choice that fills the folder field ("Where it works now: …/launch-plan" first). The field stays free to edit. */
export function NewSessionPlaces({ places, cwd, onPick }: { places: NewSessionPlace[]; cwd: string; onPick: (cwd: string) => void }) {
  const short = shortFolderNames(places.map((p) => p.cwd))
  return (
    <fieldset>
      <legend className={`${ink.label} mb-1.5`}>Folder</legend>
      <div className="flex flex-wrap gap-2">
        {places.map((p) => (
          <Button
            key={p.cwd}
            variant="plain"
            aria-pressed={p.cwd === cwd.trim()}
            title={p.cwd}
            className={chip({ kind: 'choice' })}
            onClick={() => onPick(p.cwd)}
          >
            {p.label}: …/{short.get(p.cwd)}
          </Button>
        ))}
      </div>
    </fieldset>
  )
}
