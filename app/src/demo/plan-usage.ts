import type { PlanAccount, PlanUsage, UsageWindow } from '@/lib/api/types'
import type { World } from './world'

/** The demo's plan usage: a Claude Max account two of the demo's machines are signed into, near the end of
 *  neither window, and a Codex Plus one whose only machine went quiet a while ago (its reading is old). Times
 *  are from now, so the countdowns read the same whenever the demo is opened. Made up. On and off is the
 *  hub's setting (`plan_usage.enabled`, `settings.ts`). */
const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString()

const w = (id: string, kind: UsageWindow['kind'], label: string, percent: number | null, inMinutes: number | null, model?: string): UsageWindow => ({
  id,
  kind,
  label,
  model: model ?? null,
  percent,
  resets_at: inMinutes === null ? null : minutes(inMinutes),
})

function accounts(): PlanAccount[] {
  return [
    {
      provider: 'claude',
      account: 'a7f3c09e5d21',
      plan: 'max',
      limited_until: null,
      observed_at: minutes(-1),
      machines: [
        { machine: 'build-box', reported_at: minutes(-1) },
        { machine: 'laptop', reported_at: minutes(-3) },
      ],
      windows: [
        w('session', 'session', '5-hour session', 44, 130),
        w('weekly', 'weekly', 'Week, all models', 68, 3120),
        w('weekly:opus', 'weekly_scoped', 'Week, Opus', 61, 3120, 'opus'),
        w('weekly:sonnet', 'weekly_scoped', 'Week, Sonnet', null, null, 'sonnet'),
      ],
    },
    {
      provider: 'codex',
      account: 'c21e5b4077aa',
      plan: 'plus',
      limited_until: null,
      observed_at: minutes(-12),
      machines: [{ machine: 'mini', reported_at: minutes(-12) }],
      windows: [w('session', 'session', '5 hours', 12, 220), w('weekly', 'weekly', 'Week', 31, 5880)],
    },
  ]
}

export function planUsage(_world: World, enabled: boolean): PlanUsage {
  return { enabled, accounts: enabled ? accounts() : [] }
}
