/** Extra arguments as typed, split as a shell would (quotes keep spaces): what the agent gets. */
export function splitArgs(text: string): string[] {
  return [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3])
}

/** The mode a new session is asked to start in: none sent means the configured default. */
export const AGENTS_OWN = 'agent'
