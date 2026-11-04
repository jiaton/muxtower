import { Check, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { NodeInfo } from '@/lib/api/types'
import { useSetNodeAddress } from '../api/use-nodes'

/** Where this device reaches a node itself while the hub is down: the address it reports (its
 *  `public_url`, or what `tailscale serve` serves it at), or one the owner sets here. https only. */
export function NodeAddress({ daemonId, node }: { daemonId: string; node: NodeInfo }) {
  const set = useSetNodeAddress(daemonId)
  const shown = node.direct_url ?? node.reported_url ?? null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.direct_url ?? '')
  const http = shown?.startsWith('http://')
  if (editing)
    return (
      <form
        className="mt-1 flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          set.mutate({ name: node.name, url: draft.trim() || null }, { onSuccess: () => setEditing(false) })
        }}
      >
        <Input
          className="h-8 text-xs"
          placeholder={node.reported_url ?? 'https://…'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Direct address of ${node.name}`}
          autoFocus
        />
        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Save the address" disabled={set.isPending}>
          <Check />
        </Button>
        {set.error ? <span className="text-xs text-state-error">{set.error.message}</span> : null}
      </form>
    )
  return (
    <span className="flex items-center gap-1 text-xs text-fg-muted">
      <span className="min-w-0 truncate">
        {shown ? `direct: ${shown}${node.direct_url ? '' : ' (reported)'}` : 'no direct address: not reachable while the hub is down'}
      </span>
      {http ? <span className="shrink-0 text-state-permission">· http cannot be reached from the app (https only)</span> : null}
      <Button variant="ghost" size="icon-sm" aria-label={`Set the direct address of ${node.name}`} title="Set its address" onClick={() => setEditing(true)}>
        <Pencil />
      </Button>
    </span>
  )
}
