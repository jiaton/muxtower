/** A whole team on one project (acme/shop-api): a PM, a tech lead, two workers and a reviewer, and the
 *  tasks they sent each other over the last few days; and a PM on acme/web-app too, so the PM role spans
 *  two projects. Made up, every word. */
import type { Session, TeamTask } from '@/lib/api/types'
import type { Scene } from '../world'
import { HOME, NODE, ago, demoSession } from './session'
import { talk } from './talk'
import { answered, bold, claudeInput, claudeWelcome, cyan, gray, para, rule, said } from './terminal'
import type { Step } from '../world'
import { prompt, reply } from './session'
import { bash, read, says, transcript, you } from './transcript'

const SHOP: Partial<Session> = {
  project: 'acme/shop-api',
  project_auto: true,
  project_source: 'git remote',
  project_anchor: `${HOME}/code/shop-api`,
}
const REPO = { repo: `${HOME}/code/shop-api`, remote: 'acme/shop-api' }

const PLAN = transcript('claude', [
  you('What is left for 2.5? Keep it to what customers will notice.', 2900),
  read('ROADMAP.md', 88),
  says('Three things: invoice PDFs customers can download, a deploy preview for every pull request, and saved carts. Invoice PDFs are the one sales keeps asking about.'),
  you('Split invoice PDFs into tasks and send them to the tech lead.', 2880),
  says('Sent: render an invoice as PDF, a download link on the order page, and a test per tax case. The lead splits them between the two workers.'),
  you('Where are we on the invoice work?', 35),
  says('The PDF renderer is merged; the download link is in review; the tax tests wait on the renderer\'s last fix. On track for Thursday.'),
]) // prettier-ignore

const LEAD = transcript('claude', [
  you('Who takes the invoice PDF work?', 2860),
  says('shop-api renders the PDF (server side, payments service); checkout page adds the download link on the laptop. I will review each before it merges.'),
  you('Why did last night\'s deploy fail?', 400),
  bash('gh run view 4411 --log-failed', 'Read the failed deploy log', 'migrate: column "invoice_no" already exists'),
  says('The deploy failed on a migration that ran twice: invoice_no was added by hand on staging. I asked the worker to make the migration skip a column that exists, and retried the deploy: green.'),
  you('Anything blocked?', 20),
  says('Only the tax tests: they wait on the renderer rounding fix, which is in review now.'),
]) // prettier-ignore

const REVIEW = transcript('claude', [
  you('Review the invoice renderer pull request.', 1500),
  bash('gh pr diff 231', 'Read the pull request', '+212 −14 in 6 files'),
  bash('npm test -- invoices', 'Run the invoice tests', '18 passed'),
  says('Approved with one change: totals are rounded per line, then summed, so a 3-line order can be a cent off. Asked for rounding once, on the total.'),
  you('And the download link?', 60),
  says('Looks right; it checks the order belongs to the signed-in customer before it serves the PDF. One nit about the button label, left as a comment.'),
]) // prettier-ignore

const WEB_PM = transcript('claude', [
  you('What should the web app ship next, from the support tickets?', 1400),
  read('support/tickets-october.csv', 412),
  says('Most asked: a dark theme, a usage chart per team, and invoice downloads from the billing page. The usage chart is already in progress.'),
  you('Write that up for the next planning call.', 300),
  says('Written to docs/next.md: three items, each with the tickets that ask for it and a guess at the size.'),
]) // prettier-ignore

function member(id: string, name: string, role: string, cwd: string, turns: ReturnType<typeof transcript>, more: Partial<Session>): Scene {
  const last = turns.items.findLast((i) => i.kind === 'reply')?.text ?? null
  const shown = cwd.replace(HOME, '~').replace('/Users/dev', '~')
  return {
    session: demoSession({ id, name, cwd, team_role: role, last_message: last, ...more }),
    history: [...claudeWelcome(shown), ...turns.history],
    footer: claudeInput,
    items: turns.items,
    reply: talk('claude', turns.next + 10),
  }
}

/** What the reviewer's session sent the lead with Claude Code's own messaging: held for the owner. */
const PEER =
  'PR 233 (the tax tests) is ready from my side: 24 tests, all green against rendered PDFs. Merge it when you are ready, or tell me what else to check.'
const PEER_OPTIONS = ['Deny — drop it and tell the sender it was declined', 'Deliver this message to Claude']
const MERGED =
  'Thanks, review. This is the demo, so nothing was merged; on your own machine I would merge PR 233 now and tell the PM the invoice work is done for Thursday.'

/** The lead's dialog for a held message: who sent it, what it says, Deliver or Deny. */
const peerDialog = [
  rule(),
  ` ${bold('Message from review')}`,
  '',
  para(PEER, '   ', '   '),
  '',
  ' Deliver it to Claude?',
  ...PEER_OPTIONS.map((label, i) => para(`${i + 1}. ${label}`, i ? '   ' : ` ${cyan('❯')} `, '      ')),
]

/** The tech lead, a message from the reviewer held for the owner: Deliver gives it to Claude as a
 *  prompt, which it answers; Deny drops it, and the lead is idle again. */
function lead(): Scene {
  const scene = member('lead', 'tech lead', 'tech lead — splits the work, merges what passed review', `${HOME}/code/shop-api`, LEAD, {
    ...SHOP, git: { ...REPO, worktree: `${HOME}/code/shop-api`, branch: 'main' }, created_at: ago(2870), updated_at: ago(1),
    state: 'needs_permission', needs_attention: true,
    pending: {
      state: 'needs_permission', kind: 'peer_message', sender: 'review', detail: PEER, tool_name: null, recommended: null, questions: [],
      options: PEER_OPTIONS.map((label, i) => ({ key: String(i + 1), label })),
    },
  }) // prettier-ignore
  const seq = LEAD.next
  const delivered = (): Step[] => [
    { after: 0, session: { state: 'busy', pending: null }, add: said(PEER), footer: claudeInput, items: [prompt(seq, { text: PEER, at: new Date().toISOString() })] },
    {
      after: 1600, add: answered(MERGED), items: [reply(seq + 1, { text: MERGED })],
      session: { state: 'idle', unread: true, last_message: MERGED, finished_at: new Date().toISOString() },
    },
  ] // prettier-ignore
  const dropped = (): Step[] => [
    { after: 0, session: { state: 'idle', pending: null }, add: [gray('  ⎿  Message from review declined')], footer: claudeInput },
  ]
  return {
    ...scene,
    footer: peerDialog,
    approve: (option) => (option === '2' ? delivered() : dropped()),
    deny: dropped,
    reply: talk('claude', seq + 10),
  }
}

/** The team's sessions besides those other scenes already are (shop-api, checkout page, docs, research). */
export const team = (): Scene[] => [
  member('pm', 'Plan 2.5', 'PM — plans each release; reads, never edits', `${HOME}/code/shop-api`, PLAN, {
    ...SHOP, git: { ...REPO, worktree: `${HOME}/code/shop-api`, branch: 'main' }, created_at: ago(2950), updated_at: ago(34),
  }), // prettier-ignore
  lead(),
  member(`${NODE}~review`, 'review', 'reviewer — reads every diff before it merges', '/Users/dev/code/shop-api-review', REVIEW, {
    ...SHOP, project_anchor: '/Users/dev/code/shop-api', node: NODE, machine: NODE, on_host: false,
    git: { repo: '/Users/dev/code/shop-api', worktree: '/Users/dev/code/shop-api-review', branch: 'review', remote: 'acme/shop-api' },
    created_at: ago(1510), updated_at: ago(58),
  }), // prettier-ignore
  member(`${NODE}~web-pm`, 'web roadmap', 'PM — the web app\'s roadmap', '/Users/dev/code/web-app', WEB_PM, {
    project: 'acme/web-app', project_auto: true, project_source: 'git remote', project_anchor: '/Users/dev/code/web-app',
    node: NODE, machine: NODE, on_host: false, created_at: ago(1420), updated_at: ago(290),
  }), // prettier-ignore
]

/** Who is who, as a task's sender is labelled: name (role) · id. */
const WHO: Record<string, string> = {
  pm: 'Plan 2.5 (PM) · pm',
  lead: 'tech lead (tech lead) · lead',
  'shop-api': 'shop-api (worker) · shop-api',
  [`${NODE}~shop-api-ui`]: `checkout page (worker) · ${NODE}~shop-api-ui`,
  [`${NODE}~review`]: `review (reviewer) · ${NODE}~review`,
  docs: 'docs (docs) · docs',
  'release-notes': 'Release notes for 2.4 (research) · release-notes',
}
const UI = `${NODE}~shop-api-ui`
const REV = `${NODE}~review`

/** [minutes ago, from (null: the owner's phone), to, text, status]. */
type Row = [number, string | null, string, string, ('delivered' | 'held' | 'undeliverable')?]
const ROWS: Row[] = [
  [4300, null, 'pm', 'Plan 2.5 from the roadmap and the support tickets; keep it to three things.'],
  [4210, 'pm', 'release-notes', 'Which support tickets ask for invoices? Count them by month.'],
  [4150, 'release-notes', 'pm', 'Report: 41 tickets ask for invoice PDFs since July, up every month. Details in notes/invoices.md.'],
  [2880, 'pm', 'lead', 'Invoice PDFs for 2.5: render one as PDF, a download link on the order page, a test per tax case.'],
  [2860, 'lead', 'shop-api', 'Render an invoice as PDF in the payments service: line items, tax, totals. Server side, no new service.'],
  [2858, 'lead', UI, 'Add a "Download invoice" link to the order page, shown once the order is paid.'],
  [
    2700,
    'shop-api',
    'lead',
    'Question: which PDF library? The two candidates differ by 4 MB in the image. Going with the smaller unless you object.',
  ],
  [2690, 'lead', 'shop-api', 'The smaller one is fine.'],
  [2200, UI, 'lead', 'Report: the link is in, behind the paid check; screenshots on PR 229.'],
  [2190, 'lead', REV, 'Review PR 229 (invoice download link).'],
  [2100, REV, UI, 'PR 229: approved, one nit on the button label.'],
  [1600, 'shop-api', 'lead', 'Report: invoice renderer done, PR 231, 18 tests.'],
  [1590, 'lead', REV, 'Review PR 231 (invoice renderer).'],
  [1500, REV, 'shop-api', 'PR 231: round once, on the total, not per line; a 3-line order is a cent off.'],
  [1380, 'shop-api', REV, 'Fixed the rounding; added the 3-line case as a test.'],
  [1300, REV, 'lead', 'PR 231 approved after the rounding fix.'],
  [1290, 'lead', 'docs', 'Document invoice downloads for customers: where the link is, what the PDF holds.'],
  [700, null, 'lead', "Last night's deploy failed; find out why."],
  [400, 'lead', 'shop-api', 'Make the invoice_no migration skip a column that already exists (staging has it by hand).'],
  [380, 'shop-api', 'lead', 'Report: migration guarded, deploy retried, green.'],
  [300, 'pm', 'lead', 'Status for Thursday, please: what is merged, what waits.'],
  [290, 'lead', 'pm', 'Renderer and link merged; tax tests wait on the rounding fix; docs in progress.'],
  [120, 'lead', 'shop-api', 'Write the tax tests: one per tax case in fixtures/tax, each against a rendered PDF.'],
  [60, 'docs', REV, 'Proof-read the invoice page in docs/billing.md before it goes live.'],
  [30, 'pm', 'release-notes', 'Draft the 2.5 announcement once the tax tests pass. Not before.', 'held'],
  [14, 'lead', UI, 'After the link: show the invoice number on the order page too.', 'held'],
  [8, 'release-notes', 'lead', 'Can I read the deploy preview of PR 229? The link 404s.', 'undeliverable'],
]

/** The team's tasks, oldest first, numbered after the ones other scenes carry. */
export const TEAM_TASKS: TeamTask[] = ROWS.map(([minutes, from, to, text, status = 'delivered'], i) => ({
  id: 100 + i,
  at: ago(minutes),
  from_id: from,
  from_label: from ? (WHO[from] ?? from) : 'device phone',
  to_id: to,
  text,
  status,
  delivered_at: status === 'delivered' ? ago(minutes - 0.2) : null,
}))
