import { CircleCheck, CircleX } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useClaim, type ClaimOutcome } from '../api/use-pairing'
import { guessDeviceName, type PairTarget } from '../pair-link'
import { Label } from '@/components/ui/label'
import { ink, look } from '@/components/ui/intents'

/** Confirms which daemons a pairing link adds, then redeems the codes. */
export function PairClaim({ targets, onDone }: { targets: PairTarget[]; onDone: (outcomes: ClaimOutcome[]) => void }) {
  const [deviceName, setDeviceName] = useState(guessDeviceName)
  const claim = useClaim()
  const outcomes = claim.data

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {targets.map((t, i) => {
          const outcome = outcomes?.[i]
          return (
            <li key={t.url} className={`${look.frame} flex items-center gap-2 px-3 py-2`}>
              {outcome ? (
                outcome.ok ? (
                  <CircleCheck className={`${ink.success} size-4`} aria-label="Paired" />
                ) : (
                  <CircleX className={`${ink.danger} size-4`} aria-label="Failed" />
                )
              ) : null}
              <div className="min-w-0 flex-1">
                <p className={`${ink.strong} truncate`}>{t.name ?? new URL(t.url).host}</p>
                <p className={`${ink.hint} truncate`}>{outcome ? outcome.message : t.url}</p>
              </div>
            </li>
          )
        })}
      </ul>
      {outcomes ? (
        <Button onClick={() => onDone(outcomes)}>Continue</Button>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            claim.mutate({ targets, deviceName: deviceName.trim() || 'device' })
          }}
        >
          <Label>
            Name this device
            <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} maxLength={60} />
          </Label>
          <Button type="submit" disabled={claim.isPending}>
            {claim.isPending ? 'Pairing…' : targets.length > 1 ? `Pair ${targets.length} daemons` : 'Pair'}
          </Button>
        </form>
      )}
    </div>
  )
}
