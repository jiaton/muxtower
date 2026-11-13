import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PairClaim } from '@/features/pairing/components/pair-claim'
import { parsePairHash } from '@/features/pairing/pair-link'
import { ink } from '@/components/ui/intents'

export const Route = createFileRoute('/pair')({ component: PairPage })

function PairPage() {
  const navigate = useNavigate()
  // Read once, then drop the codes from the address bar and history.
  const [targets] = useState(() => {
    const found = parsePairHash(location.hash, location.origin)
    history.replaceState(null, '', location.pathname)
    return found
  })

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-4 md:items-center">
      <div className="w-full max-w-md">
        {targets.length ? (
          <Card className="flex flex-col gap-4">
            <div>
              <h1 className={ink.title}>Pair this device</h1>
              <p className={ink.hint}>Each daemon gives this device its own token, which you can revoke later.</p>
            </div>
            <PairClaim targets={targets} onDone={() => void navigate({ to: '/' })} />
          </Card>
        ) : (
          <EmptyState title="This pairing link is empty or broken">Ask for a new one with `muxtower pair`.</EmptyState>
        )}
      </div>
    </div>
  )
}
