import { CircleAlert, CircleCheck, Copy, Filter, Gauge, Pause, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { FiringOutcome } from '@/lib/api/types'
import { OUTCOMES } from '../model/summary'

const ICONS: Record<FiringOutcome, LucideIcon> = {
  delivered: CircleCheck,
  started: CircleCheck,
  notified: CircleCheck,
  filtered: Filter,
  deduped: Copy,
  paused: Pause,
  rate_limited: Gauge,
  failed: CircleAlert,
}

/** What became of a firing: its word, its tone and its own icon, so no two read alike without colour. */
export function OutcomeBadge({ outcome }: { outcome: FiringOutcome }) {
  const { label, tone, hint } = OUTCOMES[outcome]
  const Icon = ICONS[outcome]
  return (
    <Badge tone={tone} title={hint}>
      <Icon aria-hidden className="size-3" />
      {label}
    </Badge>
  )
}
