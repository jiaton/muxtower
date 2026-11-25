// A made-up hub for the Inbox's tests (MSW at the HTTP boundary): its items, each project's targets and default
// hand-off role, and every request it was sent. Made-up names only.
import { http, HttpResponse } from 'msw'
import type { HandoffTargets, InboxItem } from '@/lib/api/types'
import { addDaemon } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'

export const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()

export function item(id: number, text: string, more: Partial<InboxItem> = {}): InboxItem {
  return {
    id, text, project: null, status: 'open', created_at: iso(60), updated_at: iso(60), order: id, version: 1,
    done_at: null, due: null, due_has_time: false, due_state: 'none', on_due: 'remind', due_target: null,
    due_fired_at: null, handed: null, ...more,
  } // prettier-ignore
}

export interface Sent {
  method: string
  path: string
  body: unknown
}

export function fakeHub(start: InboxItem[], targets: Record<string, Omit<HandoffTargets, 'project'>> = {}) {
  addDaemon()
  const hub = {
    items: [...start],
    done: [] as InboxItem[],
    sent: [] as Sent[],
    targets,
    /** The next hand is refused with this reason (409). */
    refuseHand: null as string | null,
    /** Changes an item as another device would (its version goes up). */
    elsewhere(id: number, patch: Partial<InboxItem>) {
      hub.items = hub.items.map((i) => (i.id === id ? { ...i, ...patch, version: i.version + 1 } : i))
    },
    patches: () => hub.sent.filter((s) => s.method === 'PATCH'),
  }
  const record = async (request: Request) => {
    const text = request.method === 'GET' || request.method === 'DELETE' ? '' : await request.text()
    const body = text ? JSON.parse(text) : null
    hub.sent.push({ method: request.method, path: new URL(request.url).pathname, body })
    return body
  }
  server.use(
    http.get(`${DAEMON_URL}/v1/inbox`, ({ request }) =>
      HttpResponse.json({ items: hub.items, ...(new URL(request.url).searchParams.get('done') ? { done: hub.done } : {}) }),
    ),
    http.post(`${DAEMON_URL}/v1/inbox`, async ({ request }) => {
      const body = (await record(request)) as { text: string; project?: string | null }
      const made = item(100 + hub.items.length, body.text, { project: body.project ?? null })
      hub.items = [made, ...hub.items]
      return HttpResponse.json(made, { status: 201 })
    }),
    http.put(`${DAEMON_URL}/v1/inbox/order`, async ({ request }) => {
      const { ids } = (await record(request)) as { ids: number[] }
      hub.items = [...ids.flatMap((id) => hub.items.filter((i) => i.id === id)), ...hub.items.filter((i) => !ids.includes(i.id))]
      // (A real hub bumps the moved items' versions: `elsewhere` stands for that where a test needs it.)
      return HttpResponse.json({ items: hub.items })
    }),
    http.patch(`${DAEMON_URL}/v1/inbox/:id`, async ({ request, params }) => {
      const body = (await record(request)) as Record<string, unknown> & { if_version: number }
      const now = hub.items.find((i) => i.id === Number(params.id))!
      if (body.if_version !== now.version) return HttpResponse.json({ detail: 'stale', current: now }, { status: 409 })
      const { if_version: _, ...patch } = body
      const next = { ...now, ...patch, version: now.version + 1 } as InboxItem
      hub.items = hub.items.map((i) => (i.id === now.id ? next : i))
      return HttpResponse.json(next)
    }),
    http.delete(`${DAEMON_URL}/v1/inbox/:id`, async ({ request, params }) => {
      await record(request)
      hub.items = hub.items.filter((i) => i.id !== Number(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
    http.post(`${DAEMON_URL}/v1/inbox/:id/hand`, async ({ request, params }) => {
      const body = (await record(request)) as { project: string; role?: string | null; session_id?: string | null }
      if (hub.refuseHand) return HttpResponse.json({ detail: hub.refuseHand }, { status: 409 })
      const now = hub.items.find((i) => i.id === Number(params.id))!
      const handed = { to_role: body.role ?? null, to_session: body.session_id ?? 's1', project: body.project, task_id: 7, at: iso(0) }
      const next: InboxItem = { ...now, status: 'handed', handed, version: now.version + 1 }
      hub.items = hub.items.map((i) => (i.id === now.id ? next : i))
      return HttpResponse.json(next)
    }),
    http.get(`${DAEMON_URL}/v1/projects/*`, ({ request }) => {
      const path = decodeURIComponent(new URL(request.url).pathname)
      const project = /^\/v1\/projects\/(.+)\/handoff-targets$/.exec(path)?.[1]
      if (!project) return new HttpResponse(null, { status: 404 })
      return HttpResponse.json({ project, default_role: null, ...(hub.targets[project] ?? { roles: [], sessions: [] }) })
    }),
    http.put(`${DAEMON_URL}/v1/projects/*`, async ({ request }) => {
      const body = (await record(request)) as { role: string | null }
      const project = /^\/v1\/projects\/(.+)\/handoff$/.exec(decodeURIComponent(new URL(request.url).pathname))![1]!
      hub.targets[project] = { ...(hub.targets[project] ?? { roles: [], sessions: [] }), default_role: body.role }
      return HttpResponse.json({ role: body.role })
    }),
  )
  return hub
}
