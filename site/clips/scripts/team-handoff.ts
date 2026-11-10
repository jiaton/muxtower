/** Clip 2, "One team, two machines": the acme-shop team, its agents on the hub (build-box) and on the
 *  laptop, the list grouped by machine. The PM gives each agent its role, hands the work to the tech lead,
 *  who splits it across the machines and watches the workers; their reports go back up, and the demo agent
 *  gets its task. The list, the conversations and their tool calls are the app's own; the arrows between
 *  rows (who handed work to whom) are drawn. */
import type { Page } from 'playwright'
import type { ClipScript, Recorder } from '../record.ts'

const at = new Date().toISOString()
const item = (seq: number, kind: string, text: string, more: object = {}) => ({
  seq,
  kind,
  text,
  at,
  actions: [],
  images: [],
  tool_name: null,
  description: null,
  status: null,
  ask: null,
  ...more,
})
const tool = (seq: number, name: string, description: string, text = '') =>
  item(seq, 'tool', text, { tool_name: `mcp__muxtower__${name}`, description, status: 'done' })

const PROJECT = 'acme-shop'
const HUB = 'build-box'
const LAPTOP = 'laptop'
/** The team: who it is, its role, and its machine. */
const TEAM = {
  pm: { id: 'pm', name: 'Order tracking', role: 'pm', on: HUB },
  lead: { id: 'lead', name: 'Tracking plan', role: 'tech lead', on: HUB },
  backend: { id: 'backend', name: 'Tracking API', role: 'backend', on: HUB },
  frontend: { id: `${LAPTOP}~frontend`, name: 'Tracking page', role: 'frontend', on: LAPTOP },
  demo: { id: `${LAPTOP}~demo`, name: 'Demo site', role: 'demo', on: LAPTOP },
} as const
type Member = (typeof TEAM)[keyof typeof TEAM]
const send = (to: Member) => `send_task → ${to.role} · ${to.on}`

const row = (page: Page, m: Member) =>
  page
    .getByRole('link')
    .filter({ has: page.getByText(m.name, { exact: true }) })
    .filter({ visible: true })
    .first()

export const teamHandoff: ClipScript = {
  id: 'team-handoff',
  // A window smaller than a desktop's, shown large, the camera still: each machine is named beside it.
  layers: [{ view: 'desktop', x: 390, y: 160, height: 890, url: 'app.muxtower.dev', still: true }],
  views: [{ name: 'desktop', kind: 'desktop', viewport: { width: 1000, height: 700 }, setup }],
  run,
}

async function setup(page: Page) {
  await page.evaluate(
    async ([team, project, laptop, pmItems, leadItems]) => {
      const clip = (window as never as { muxtowerClip: Record<string, (...a: unknown[]) => unknown> }).muxtowerClip
      clip.hold!()
      // Only the team: the demo's own sessions go, and its groups of projects (one project needs none).
      for (const s of clip.sessions!() as { id: string }[]) clip.remove!(s.id)
      Object.values(team).forEach((m, i) => {
        const there = m.on === laptop
        clip.add!({
          id: m.id,
          name: m.name,
          cwd: there ? `/Users/dev/code/${project}` : `/home/dev/code/${project}`,
          machine: m.on,
          node: there ? laptop : null,
          project,
          team_role: null,
          state: 'idle',
          last_message: 'Ready for work.',
          // In this order on each machine; changes keep it (`mark`).
          updated_at: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
        })
      })
      clip.setItems!(team.pm.id, pmItems)
      clip.setItems!(team.lead.id, leadItems)
      await fetch('https://daemon.demo.invalid/v1/chip-groups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: [] }),
      })
      window.dispatchEvent(new Event('visibilitychange')) // the app asks again, as when it comes back
      location.hash = `#/d/demo/s/${team.pm.id}`
    },
    [
      TEAM,
      PROJECT,
      LAPTOP,
      [item(1, 'prompt', 'Ship order tracking for acme-shop. Set up the team and run it.')],
      [item(1, 'prompt', '[muxtower task from Order tracking (pm)] Ship order tracking: a page that shows where an order is.')],
    ] as const,
  )
  await page.waitForTimeout(900)
  // The list by machine: the list's own setting.
  await page.getByRole('button', { name: 'List options' }).filter({ visible: true }).first().click()
  await page.getByRole('menuitemradio', { name: 'Device and folder' }).click()
  await page.waitForTimeout(300)
  const toggle = page.locator('[aria-label="Conversation"]').filter({ visible: true })
  if (await toggle.count()) await toggle.first().click()
  await page.waitForTimeout(500)
}

async function run(r: Recorder) {
  const { page } = r
  const { pm, lead, backend, frontend, demo } = TEAM

  r.caption('One team, on two machines')
  await r.machine(row(page, pm), row(page, backend), HUB, 'the hub')
  await r.wait(300)
  await r.machine(row(page, frontend), row(page, demo), LAPTOP)
  await r.wait(1500)

  r.caption('The PM gives each agent a role')
  let seq = 2
  for (const m of [lead, backend, frontend, demo]) {
    await r.play(pm.id, [{ after: 0, items: [tool(seq++, 'set_role', `set_role ${m.role} · ${m.on}`)] }])
    await r.hook('mark', m.id, { team_role: m.role })
    await r.focus(row(page, m))
    await r.wait(250)
  }
  await r.hook('mark', pm.id, { team_role: pm.role })
  await r.focus(row(page, pm))
  await r.wait(700)

  r.caption('It hands the work to the tech lead')
  await r.focus(null)
  await r.play(pm.id, [
    { after: 0, items: [item(seq++, 'reply', 'Roles set. The plan goes to the tech lead.'), tool(seq++, 'send_task', send(lead))] },
  ])
  await r.hook('mark', pm.id, { state: 'busy', last_message: 'Handing the plan to the tech lead' })
  await r.arrow(row(page, pm), row(page, lead), send(lead), 1700)
  await r.hook('mark', lead.id, { state: 'busy', last_message: 'Splitting the work' })
  await r.wait(1700)

  r.caption('The tech lead splits it across machines')
  await r.click(row(page, lead), 200)
  await r.play(lead.id, [
    {
      after: 0,
      items: [item(2, 'reply', 'Two parts: the API on build-box, the page on the laptop.'), tool(3, 'send_task', send(backend))],
    },
  ])
  await r.arrow(row(page, lead), row(page, backend), send(backend), 1400)
  await r.hook('mark', backend.id, { state: 'busy', last_message: 'Adding GET /orders/:id/tracking' })
  await r.wait(1450)
  await r.play(lead.id, [{ after: 0, items: [item(4, 'reply', 'The page goes to the laptop.'), tool(5, 'send_task', send(frontend))] }])
  await r.arrow(row(page, lead), row(page, frontend), send(frontend), 1600)
  await r.hook('mark', frontend.id, { state: 'busy', last_message: 'Building the tracking page' })
  await r.wait(1500)

  r.caption('It watches them work')
  await r.hook('mark', lead.id, { state: 'idle', last_message: 'Watching backend and frontend' })
  await r.play(lead.id, [
    {
      after: 0,
      items: [
        item(6, 'reply', 'Both are on it. I will watch them.'),
        tool(7, 'watch_session', 'watch_session backend · build-box, frontend · laptop'),
      ],
    },
  ])
  await r.focus(page.getByText('watch_session backend').filter({ visible: true }).last())
  await r.wait(900)
  await r.hook('mark', backend.id, { state: 'idle', unread: true, last_message: 'Done: the tracking endpoint, with tests.' })
  await r.play(lead.id, [{ after: 0, items: [item(8, 'prompt', '[muxtower event #1] name="Tracking API" finished a turn · state=idle')] }])
  await r.wait(900)
  await r.hook('mark', frontend.id, { state: 'idle', unread: true, last_message: 'Done: the tracking page, checked in a browser.' })
  await r.play(lead.id, [{ after: 0, items: [item(9, 'prompt', '[muxtower event #2] name="Tracking page" finished a turn · state=idle')] }])
  await r.focus(page.getByText('[muxtower event #2]').filter({ visible: true }).last())
  await r.wait(1200)

  r.caption('Reports go up, and the demo gets updated')
  await r.focus(null)
  await r.play(lead.id, [{ after: 0, items: [item(10, 'reply', 'Both done. Telling the PM.'), tool(11, 'send_task', send(pm))] }])
  await r.arrow(row(page, lead), row(page, pm), send(pm), 1300)
  await r.wait(1500)
  await r.play(pm.id, [
    {
      after: 0,
      items: [
        item(seq++, 'prompt', '[muxtower task from Tracking plan (tech lead)] Order tracking is done: API and page.'),
        item(seq++, 'reply', 'Good. The demo should show it.'),
        tool(seq++, 'send_task', send(demo)),
      ],
    },
  ])
  await r.arrow(row(page, pm), row(page, demo), send(demo), 1800)
  await r.hook('mark', demo.id, { state: 'busy', last_message: 'Adding order tracking to the demo' })
  await r.focus(row(page, demo))
  await r.wait(1600)
}
