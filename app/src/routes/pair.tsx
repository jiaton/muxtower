import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PairClaim } from '@/features/pairing/components/pair-claim'
import { parsePairHash } from '@/features/pairing/pair-link'

export const Route = createFileRoute('/pair')({ component: PairPage })

function PairPage() {
  const navigate = useNavigate()
  // Read once, then drop the codes from the address bar and history.
  const [targets] = useState(() => {
    const found = parsePairHash(location.hash)
    history.replaceState(null, '', location.pathname)
    return found
  })

  if (!targets.length)
    return <EmptyState title="This pairing link is empty or broken">Ask for a new one with `muxtower pair`.</EmptyState>
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Pair this device</h1>
        <p className="text-sm text-fg-muted">Each daemon gives this device its own token, which you can revoke later.</p>
      </div>
      <PairClaim targets={targets} onDone={() => void navigate({ to: '/' })} />
    </Card>
  )
}
