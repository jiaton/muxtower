/** Example teams: made-up projects, each with no more than three roles. A role is plain text the owner
 *  gives a session; muxtower keeps it and reads nothing into it, so these are examples, not presets. */

export interface Member {
  role: string
  machine: string
  does: string
}

export interface Handoff {
  from: string
  to: string
  text: string
}

export interface TeamExample {
  project: string
  about: string
  members: Member[]
  /** One piece of work going around the team, in order. */
  flow: Handoff[]
}

export const teamExamples: TeamExample[] = [
  {
    project: 'acme/shop',
    about: 'An online store',
    members: [
      {
        role: 'pm',
        machine: 'macbook',
        does: 'Talks it through with you, turns what you want into tasks, and tells you when they are done.',
      },
      { role: 'worker', machine: 'server', does: 'Writes the code and its tests in its own worktree, and runs them before it says done.' },
      {
        role: 'reviewer',
        machine: 'server',
        does: 'Reads each finished diff, runs the whole suite, and sends what it finds back to the worker.',
      },
    ],
    flow: [
      { from: 'you', to: 'pm', text: 'Customers keep asking for Apple Pay. Can we have it by Friday?' },
      { from: 'pm', to: 'worker', text: 'Add Apple Pay to checkout behind the apple_pay flag. Card flow unchanged. Tests for both.' },
      { from: 'worker', to: 'reviewer', text: 'Done on branch apple-pay: 14 files, 212 tests pass.' },
      { from: 'reviewer', to: 'worker', text: 'One fix: the flag is read once at start; read it per request.' },
      { from: 'pm', to: 'you', text: 'Apple Pay is ready behind the flag, reviewed. Turn it on for 10% of checkouts?' },
    ],
  },
  {
    project: 'acme/api',
    about: 'The API behind it',
    members: [
      {
        role: 'research',
        machine: 'vps',
        does: 'Reads the logs and the code, finds why requests fail, and writes the plan. Changes nothing.',
      },
      { role: 'worker', machine: 'vps', does: 'Carries out the plan: the migration and the fix, on staging first.' },
    ],
    flow: [
      { from: 'you', to: 'research', text: 'p99 latency doubled since Monday. Why?' },
      { from: 'research', to: 'worker', text: 'Orders by customer has no index since 0041. Add it concurrently, staging first.' },
      { from: 'worker', to: 'research', text: 'Index built on staging in 41 s; p99 back to 180 ms.' },
    ],
  },
  {
    project: 'acme/infra',
    about: 'The machines themselves',
    members: [
      { role: 'ops', machine: 'nas', does: 'Checks backups and certificates every morning and asks you before it changes anything.' },
      { role: 'worker', machine: 'pc', does: 'Does what ops hands it: a provider upgrade, a new replica, a firewall rule.' },
    ],
    flow: [
      { from: 'ops', to: 'you', text: 'The certificate for the status page expires in 9 days. Renew it with DNS validation?' },
      { from: 'you', to: 'ops', text: 'Yes, and move the job to the new provider while you are at it.' },
      { from: 'ops', to: 'worker', text: 'Upgrade the DNS provider module to 5.x and plan the certificate renewal. Plan only.' },
    ],
  },
]
