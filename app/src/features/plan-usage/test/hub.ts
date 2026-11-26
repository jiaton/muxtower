// A made-up hub for plan usage's tests (MSW at the HTTP boundary): what it reports, and the settings it was
// sent. Made-up names only.
import { http, HttpResponse } from 'msw'
import type { PlanAccount, PlanUsage, UsageWindow } from '@/lib/api/types'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'

/** An ISO time `n` minutes from now (before now when negative). */
export const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString()

const LABEL = { session: '5-hour session', weekly: 'Week, all models', other: 'Other' } as const

export function win(kind: UsageWindow['kind'], percent: number | null, inMinutes: number | null, more: Partial<UsageWindow> = {}): UsageWindow {
  const model = more.model ?? null
  return {
    id: kind === 'weekly_scoped' ? `weekly:${model}` : kind,
    kind,
    label: kind === 'weekly_scoped' ? `Week, ${model}` : LABEL[kind],
    model,
    percent,
    resets_at: inMinutes === null ? null : minutes(inMinutes),
    ...more,
  }
}

const machines = (...names: string[]) => names.map((machine) => ({ machine, reported_at: minutes(-1) }))

export function claude(more: Partial<PlanAccount> = {}): PlanAccount {
  return {
    provider: 'claude', account: 'a7f3c09e5d21', plan: 'max', machines: machines('build-box', 'mini'), limited_until: null, observed_at: minutes(-1),
    windows: [win('session', 44, 130), win('weekly', 68, 3120), win('weekly_scoped', 61, 3120, { model: 'Opus' }), win('weekly_scoped', null, null, { model: 'Sonnet' })],
    ...more,
  } // prettier-ignore
}

export function codex(more: Partial<PlanAccount> = {}): PlanAccount {
  return {
    provider: 'codex', account: 'c21e5b4077aa', plan: 'plus', machines: machines('laptop'), limited_until: null, observed_at: minutes(-1),
    windows: [win('session', 12, 220, { label: '5 hours' }), win('weekly', 31, 5880, { label: 'Week' })],
    ...more,
  } // prettier-ignore
}

export function fakeHub(start: PlanUsage) {
  addDaemon()
  const hub = {
    usage: start,
    /** The settings changes it was sent (`PATCH /v1/settings`). */
    settings: [] as unknown[],
    /** The next change is refused (500). */
    refuse: false,
  }
  server.use(
    http.get(`${DAEMON_URL}/v1/plan-usage`, () => HttpResponse.json(hub.usage)),
    http.patch(`${DAEMON_URL}/v1/settings`, async ({ request }) => {
      const body = (await request.json()) as { values: Record<string, unknown> }
      hub.settings.push(body.values)
      if (hub.refuse) return HttpResponse.json({ detail: 'nope' }, { status: 500 })
      if ('plan_usage.enabled' in body.values) hub.usage = { ...hub.usage, enabled: body.values['plan_usage.enabled'] === true }
      return HttpResponse.json({ machine: 'build-box', settings: [] })
    }),
  )
  return hub
}
