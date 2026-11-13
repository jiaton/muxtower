import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PairTarget } from '../pair-link'
import { PairClaim } from './pair-claim'
import { text } from '@/components/ui/styles'

/** Type the code `muxtower pair` printed, for a daemon whose address is already known (e.g. the one
 *  serving this page). */
export function PairCodeForm({ url, onDone }: { url: string; onDone?: () => void }) {
  const [code, setCode] = useState('')
  const [targets, setTargets] = useState<PairTarget[] | null>(null)
  if (targets) return <PairClaim targets={targets} onDone={() => onDone?.()} />
  return (
    <form
      className="flex w-full max-w-xs flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        setTargets([{ url, code: code.trim() }])
      }}
    >
      <Input
        required
        placeholder="K7QM-3XPA"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        aria-label="Pairing code"
        className={`${text({ mono: true, spaced: 'widest' })} text-center`}
      />
      <Button type="submit">Pair</Button>
    </form>
  )
}
