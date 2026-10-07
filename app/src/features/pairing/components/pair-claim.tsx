import { CircleCheck, CircleX } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useClaim, type ClaimOutcome } from '../api/use-pairing'
import { guessDeviceName, type PairTarget } from '../pair-link'

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
            <li key={t.url} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
              {outcome ? (
                outcome.ok ? (
                  <CircleCheck className="size-4 text-success" aria-label="Paired" />
                ) : (
                  <CircleX className="size-4 text-danger" aria-label="Failed" />
                )
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.name ?? new URL(t.url).host}</p>
                <p className="truncate text-sm text-fg-muted">{outcome ? outcome.message : t.url}</p>
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
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name this device
            <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} maxLength={60} />
          </label>
          <Button type="submit" disabled={claim.isPending}>
            {claim.isPending ? 'Pairing…' : targets.length > 1 ? `Pair ${targets.length} daemons` : 'Pair'}
          </Button>
        </form>
      )}
    </div>
  )
}
