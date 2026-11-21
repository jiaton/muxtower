import type { Session } from '@/lib/api/types'
import type { Scene } from '../world'
import { HOME, NODE, ago, demoSession, prompt, reply } from './session'
import { talk } from './talk'
import { answered, claudeInput, claudeWelcome, said } from './terminal'

/** More projects, so a list grouped by project (and the sidebar's Projects) has a few to tell apart.
 *  Made up, every word. */
function plain(id: string, name: string, project: string, asked: string, answer: string, more: Partial<Session>): Scene {
  const repo = project.split('/')[1]
  const onNode = more.node === NODE
  const cwd = `${onNode ? '/Users/dev' : HOME}/code/${repo}`
  return {
    session: demoSession({
      id: onNode ? `${NODE}~${id}` : id,
      name,
      cwd,
      git: { repo: cwd, worktree: cwd, branch: 'main', remote: project },
      project,
      project_auto: true,
      project_source: 'git remote',
      project_anchor: cwd,
      ...(onNode ? { machine: NODE, on_host: false } : {}),
      last_message: answer,
      ...more,
    }),
    history: [...claudeWelcome(`~/code/${repo}`), ...said(asked), ...answered(answer)],
    footer: claudeInput,
    items: [prompt(1, { text: asked, at: ago(30) }), reply(2, { text: answer, at: ago(28) })],
    reply: talk('claude', 10),
  }
}

export const moreProjects = (): Scene[] => [
  plain('docs-site', 'API reference pages', 'acme/docs', 'Generate the reference pages for the v2 endpoints.', 'Twelve pages written, one per endpoint.', {
    team_role: 'writer', created_at: ago(120), updated_at: ago(12), unread: true,
  }),
  plain('docs-links', 'Fix broken links', 'acme/docs', 'Find and fix the broken links.', 'Fixed 7; 2 point to pages that no longer exist.', {
    node: NODE, created_at: ago(200), updated_at: ago(55),
  }),
  plain('mobile-push', 'Push opt-in screen', 'acme/mobile', 'Build the push opt-in screen.', 'The screen is in; it asks once, after the first order.', {
    node: NODE, state: 'busy', team_role: 'worker — onboarding', created_at: ago(60), updated_at: ago(1),
  }),
  plain('mobile-crash', 'Crash on rotate', 'acme/mobile', 'Why does the cart crash when the phone rotates?', 'The cart view kept a stale adapter; fixed.', {
    created_at: ago(400), updated_at: ago(90),
  }),
  plain('nightly-train', 'Nightly training job', 'labs/ml-pipeline', 'Move the nightly training to the new queue.', 'Moved; tonight runs on the new queue.', {
    state: 'busy', team_role: 'ops', created_at: ago(80), updated_at: ago(3),
  }),
  plain('eval-report', 'Eval report', 'labs/ml-pipeline', 'Summarise last night\'s eval.', 'Accuracy up 0.4 points; latency flat.', {
    node: NODE, unread: true, finished_at: ago(20), created_at: ago(150), updated_at: ago(20),
  }),
  plain('ds-tokens', 'Spacing tokens', 'labs/design-system', 'Add the spacing tokens to the theme.', 'Added 8 steps, 2 to 64 px.', {
    team_role: 'lead', created_at: ago(240), updated_at: ago(35),
  }),
  plain('dotfiles', 'zsh prompt', 'personal/dotfiles', 'Make the prompt show the git branch.', 'Done: the branch shows after the folder.', {
    node: NODE, created_at: ago(600), updated_at: ago(180),
  }),
] // prettier-ignore
