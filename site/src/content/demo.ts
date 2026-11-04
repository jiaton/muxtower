/** The live demo's scenarios: each opens a session of the demo app (ids from `app/src/demo/`). */

export type ScenarioId = 'approve' | 'answer' | 'watch' | 'team' | 'machines' | 'desktop'

export interface Scenario {
  id: ScenarioId
  label: string
  description: string
  /** The demo session it opens; none: the session list. */
  session?: string
}

export const demo = {
  eyebrow: 'Live demo',
  title: 'Try it right here.',
  lead: 'This is the real app, running in your browser against a simulated daemon. Tap around: approve the command, answer the question, open the menu.',
  fullScreen: 'Open the demo full screen',
  frameTitle: 'The muxtower app, running against a simulated daemon',
}

export const scenarios: Scenario[] = [
  {
    id: 'approve',
    label: 'Approve a command',
    description:
      'Claude Code wants to run `npm test -- payments`. You see the exact command, and one tap answers the dialog in its terminal.',
    session: 'shop-api',
  },
  {
    id: 'answer',
    label: 'Answer a question',
    description: "When an agent asks which way to go, its choices become buttons. Or type an answer; it lands in the agent's prompt.",
    session: 'web-app',
  },
  {
    id: 'watch',
    label: 'Watch it work',
    description: 'The live terminal, sized for your phone, and the conversation beside it. Swipe between them.',
    session: 'docs',
  },
  {
    id: 'team',
    label: 'Agents as a team',
    description:
      'Give each session a role. This worker got its job from the research session as a task: open the menu, then Team, to see its role, its project and the tasks it was sent.',
    session: 'shop-api',
  },
  {
    id: 'machines',
    label: 'Every computer, one list',
    description:
      'Your laptop joins the always-on machine as a node, and its sessions show up in the same list. Under each computer, sessions sit by project and repository, a worktree by its branch, and a fork under the session it came from.',
  },
  {
    id: 'desktop',
    label: 'Desktop sessions too',
    description: 'Sessions from the Claude desktop app and Remote Control are listed with their conversation, and you can message them.',
    session: 'release-notes',
  },
]
