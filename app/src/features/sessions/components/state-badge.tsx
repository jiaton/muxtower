import { Badge } from '@/components/ui/badge'
import { STATE_LABEL, STATE_TONE } from '@/lib/agent-state'
import type { AgentState } from '@/lib/api/types'

export function StateBadge({ state }: { state: AgentState }) {
  return <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
}
