import { Badge } from '@/components/ui/badge'
import { STATE_TONE, stateLabel } from '@/lib/agent-state'
import type { AgentState } from '@/lib/api/types'

/** A session's state; `kind`, what its pending prompt is (`pending.kind`), names a Claude Code dialog as one. */
export function StateBadge({ state, kind }: { state: AgentState; kind?: string | null }) {
  return <Badge tone={STATE_TONE[state]}>{stateLabel(state, kind)}</Badge>
}
