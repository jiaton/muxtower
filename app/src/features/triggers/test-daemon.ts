import { http, HttpResponse } from 'msw'
import type { Firing, Session, Trigger } from '@/lib/api/types'
import { DAEMON_URL, server } from '@/test/server'

/** Made-up triggers for the tests. */
export const TRIGGER: Trigger = {
  id: 'deals', name: 'deals', enabled: true, action: { kind: 'deliver', to: 'buyer@acme/deals' },
  filter: [{ field: 'deal.price', op: 'regex', value: '^[0-9]\\.' }], dedupe: { days: 7, field: null }, rate_per_hour: 3,
  created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-02T00:00:00Z',
  last_fired_at: new Date(Date.now() - 12 * 60_000).toISOString(), last_outcome: 'failed',
} // prettier-ignore

export const firing = (id: number, outcome: Firing['outcome'], more: Partial<Firing> = {}): Firing => ({
  id, trigger_id: 'deals', at: new Date(Date.now() - id * 60_000).toISOString(), via: 'webhook', outcome, bytes: 10, ...more,
}) // prettier-ignore

export const SESSIONS = [
  { id: 'buyer1', name: 'Buyer', team_role: 'buyer', project: 'acme/deals', runtime: 'claude-code', permission_mode: 'bypassPermissions', archived_at: null },
  { id: 'safe1', name: 'Careful', team_role: 'careful', project: 'acme/deals', runtime: 'claude-code', permission_mode: 'plan', archived_at: null },
] as unknown as Session[]

/** A hub with `triggers`; what the app sent is recorded, `[method path, body]`. */
export function serveTriggers(given: Trigger[] = [TRIGGER], firings: Firing[] = []) {
  const triggers = given.map((t) => structuredClone(t))
  const sent: [string, unknown][] = []
  const record = async (label: string, request: Request) => sent.push([label, request.body ? await request.json() : null])
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions`, () => HttpResponse.json(SESSIONS)),
    http.get(`${DAEMON_URL}/v1/runtimes`, () => HttpResponse.json([])),
    http.get(`${DAEMON_URL}/v1/nodes`, () => HttpResponse.json([])),
    http.get(`${DAEMON_URL}/v1/triggers`, () => HttpResponse.json(triggers)),
    http.post(`${DAEMON_URL}/v1/triggers`, async ({ request }) => {
      await record('POST /v1/triggers', request)
      const spec = sent.at(-1)![1] as Trigger
      return HttpResponse.json({ trigger: { ...TRIGGER, ...spec, id: spec.name }, secret: 'made-up-secret-1' }, { status: 201 })
    }),
    http.patch(`${DAEMON_URL}/v1/triggers/:id`, async ({ request, params }) => {
      await record(`PATCH ${String(params.id)}`, request)
      const t = triggers.find((x) => x.id === params.id)!
      const { clear_dedupe: _d, clear_rate: _r, ...patch } = sent.at(-1)![1] as Record<string, unknown>
      Object.assign(t, patch, { updated_at: new Date().toISOString() })
      return HttpResponse.json(t)
    }),
    http.delete(`${DAEMON_URL}/v1/triggers/:id`, ({ params }) => {
      sent.push([`DELETE ${String(params.id)}`, null])
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${DAEMON_URL}/v1/triggers/:id/firings`, () => HttpResponse.json(firings)),
    http.post(`${DAEMON_URL}/v1/triggers/:id/secret`, () => HttpResponse.json({ secret: 'made-up-secret-2' })),
    http.post(`${DAEMON_URL}/v1/triggers/:id/test`, async ({ request }) => {
      await record('POST test', request)
      return HttpResponse.json(firing(99, 'failed', { via: 'test', detail: 'not built yet' }))
    }),
  )
  return sent
}
