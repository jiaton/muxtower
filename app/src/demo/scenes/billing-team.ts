/** A small team on one project (acme/billing) on two machines, for the Team dialog: a PM, a tech lead, two
 *  workers and a reviewer, in mixed states, with six tasks between them today, one held. Made up, every word. */
import type { Session, TeamTask } from '@/lib/api/types'
import type { Scene } from '../world'
import { HOME, NODE, ago, demoSession, prompt, reply } from './session'
import { talk } from './talk'
import { answered, claudeInput, claudeWelcome, said } from './terminal'

const PROJECT = 'acme/billing'

function member(id: string, name: string, role: string, onNode: boolean, asked: string, answer: string, more: Partial<Session>): Scene {
  const cwd = `${onNode ? '/Users/dev' : HOME}/code/billing`
  return {
    session: demoSession({
      id, name, cwd, team_role: role, project: PROJECT, project_auto: true, project_source: 'git remote', project_anchor: cwd,
      git: { repo: cwd, worktree: cwd, branch: 'main', remote: PROJECT },
      ...(onNode ? { node: NODE, machine: NODE, on_host: false } : {}),
      last_message: answer, ...more,
    }), // prettier-ignore
    history: [...claudeWelcome('~/code/billing'), ...said(asked), ...answered(answer)],
    footer: claudeInput,
    items: [prompt(1, { text: asked, at: ago(50) }), reply(2, { text: answer, at: ago(48) })],
    reply: talk('claude', 10),
  }
}

const L = `${NODE}~bill-refunds`
const R = `${NODE}~bill-review`

/** [minutes ago, from, to, text, status]. */
type Row = [number, string, string, string, ('delivered' | 'held')?]
const ROWS: Row[] = [
  [410, 'bill-pm', 'bill-lead', 'Usage-based plans for 3.1: metered seats, a usage page, and an invoice line per meter.'],
  [395, 'bill-lead', 'bill-meter', 'Count seats per day in the meter service; one row per team, kept 13 months.'],
  [390, 'bill-lead', L, 'Refunds for metered plans: pro-rate by day, never below zero.'],
  [140, 'bill-meter', 'bill-lead', 'Report: seat meter in, PR 412, 22 tests. Backfill runs tonight.'],
  [132, 'bill-lead', R, 'Review PR 412 (seat meter); check the backfill is safe to re-run.'],
  [9, R, 'bill-meter', 'PR 412: approved after one change. The backfill skips days it already counted.', 'held'],
]

const TASKS: TeamTask[] = ROWS.map(([minutes, from, to, text, status = 'delivered'], i) => ({
  id: 500 + i, at: ago(minutes), from_id: from, from_label: from, to_id: to, text, status,
  delivered_at: status === 'delivered' ? ago(minutes - 0.2) : null,
})) // prettier-ignore

const own = (id: string) => TASKS.filter((t) => t.from_id === id || t.to_id === id).reverse()

export const billingTeam = (): Scene[] =>
  [
    member('bill-pm', 'Plan 3.1', 'PM — plans each release', false, 'What goes in 3.1?', 'Usage-based plans: three pieces, sent to the lead.', {
      created_at: ago(500), updated_at: ago(40),
    }),
    member('bill-lead', 'billing lead', 'tech lead — splits and merges', false, 'Split the usage plans.', 'Split in two: the seat meter and refunds.', {
      state: 'busy', created_at: ago(480), updated_at: ago(1),
    }),
    member('bill-meter', 'seat meter', 'worker', false, 'Build the seat meter.', 'The meter is in; the backfill runs tonight.', {
      state: 'needs_permission', needs_attention: true, created_at: ago(400), updated_at: ago(2),
      pending: {
        state: 'needs_permission', tool_name: 'Bash', detail: 'npm run backfill -- --days 30',
        options: [{ key: '1', label: 'Yes' }, { key: '2', label: 'No' }], recommended: '1', questions: [],
      },
    }),
    member(L, 'refunds', 'worker', true, 'Pro-rate refunds for metered plans.', 'Refunds pro-rate by day now; tests pass.', {
      state: 'busy', created_at: ago(390), updated_at: ago(3),
    }),
    member(R, 'review', 'reviewer', true, 'Review PR 412.', 'Approved after one change to the backfill.', {
      created_at: ago(300), updated_at: ago(9),
    }),
  ].map((scene) => ({ ...scene, tasks: own(scene.session.id) })) // prettier-ignore
