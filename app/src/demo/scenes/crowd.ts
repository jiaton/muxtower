import type { Scene } from '../world'
import { HOME, ago, demoSession, prompt, reply } from './session'
import { claudeInput, claudeWelcome, said, answered } from './terminal'

const PROJECTS = ['acme/web', 'acme/shop-api', 'acme/docs', 'acme/mobile', 'labs/ml-pipeline', 'labs/design-system', 'acme/infra']
const TASKS = [
  ['Tidy the imports', 'Sorted and grouped; no change in behaviour.'],
  ['Add a retry to the fetch', 'Retries twice with backoff; a test covers it.'],
  ['Rename the config keys', 'Renamed; the old keys still read for a release.'],
  ['Write the release notes', 'A draft is in NOTES.md.'],
  ['Speed up the test run', 'Down from 90 s to 40 s by sharing the fixture.'],
  ['Fix the flaky date test', 'It used the local time zone; now UTC.'],
] as const

/** Made-up sessions to bring the demo's list to `total` (`?sessions=80`): a crowded hub, for measuring the
 *  list at size. Spread over the demo's projects, idle, each with a short exchange. */
export function crowd(have: number, total: number): Scene[] {
  return Array.from({ length: Math.max(0, total - have) }, (_, i) => {
    const project = PROJECTS[i % PROJECTS.length]!
    const [asked, answer] = TASKS[i % TASKS.length]!
    const repo = project.split('/')[1]!
    const cwd = `${HOME}/code/${repo}`
    return {
      session: demoSession({
        id: `crowd-${i + 1}`,
        name: `${asked} (${i + 1})`,
        cwd,
        git: { repo: cwd, worktree: cwd, branch: 'main', remote: project },
        project,
        project_auto: true,
        project_source: 'git remote',
        project_anchor: cwd,
        last_message: answer,
        created_at: ago(1000 + i * 7),
        updated_at: ago(300 + i * 5),
      }),
      history: [...claudeWelcome(`~/code/${repo}`), ...said(asked), ...answered(answer)],
      footer: claudeInput,
      items: [prompt(1, { text: asked, at: ago(300) }), reply(2, { text: answer, at: ago(299) })],
    }
  })
}
