/** The demo's team playbook: a made-up example (never anyone's own), kept for the visit, versions and all. */
import type { PlaybookPart, PlaybookVersion } from '@/lib/api/types'

const SHARED_TEXT = `- Read my_team first; ask the session whose role fits, not the owner, when one does.
- One report per finished task: what changed, how it was checked. A report needs no answer.
- Never push to a repository you were not asked to work in.
- Ask before anything that costs money or cannot be undone.`
const WEB_TEXT = `- Run the tests before every push.
- A UI change comes with phone and desktop screenshots.`

type Store = { versions: PlaybookVersion[] }
const STORES = new WeakMap<object, Store>()
const at = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

function store(world: object): Store {
  let found = STORES.get(world)
  if (!found) {
    found = {
      versions: [
        { scope: 'shared', mode: 'add', version: 1, text: SHARED_TEXT.split('\n').slice(0, 2).join('\n'), at: at(6), author: 'phone' },
        { scope: 'shared', mode: 'add', version: 2, text: SHARED_TEXT, at: at(2), author: 'laptop' },
        { scope: 'projects/acme/web-app', mode: 'add', version: 1, text: WEB_TEXT, at: at(1), author: 'phone' },
      ],
    }
    STORES.set(world, found)
  }
  return found
}

function current(world: object, scope: string): PlaybookPart {
  const latest = store(world)
    .versions.filter((v) => v.scope === scope)
    .sort((a, b) => b.version - a.version)[0]
  return latest ?? { scope, mode: 'add', version: 0, text: '' }
}

export function playbook(world: object, effectiveFor: string | null) {
  const scopes = [...new Set(store(world).versions.map((v) => v.scope))].filter((s) => s !== 'shared')
  const projects = scopes.map((s) => current(world, s)).filter((p) => p.text.trim() || p.mode === 'replace')
  const shared = current(world, 'shared')
  let effective: PlaybookPart[] | null = null
  if (effectiveFor !== null) {
    const own = effectiveFor ? current(world, `projects/${effectiveFor}`) : null
    effective =
      own && own.mode === 'replace' && own.version
        ? own.text.trim()
          ? [own]
          : []
        : [shared, own].filter((p): p is PlaybookPart => !!p && !!p.text.trim())
  }
  return { shared, projects, effective }
}

export const versions = (world: object, scope: string) =>
  store(world)
    .versions.filter((v) => v.scope === scope)
    .sort((a, b) => b.version - a.version)

/** A new version; null when another was saved since `base`. */
export function save(world: object, scope: string, text: string, mode: 'add' | 'replace', base: number, note?: string) {
  const now = current(world, scope)
  if (now.version !== base) return null
  const next: PlaybookVersion = {
    scope,
    mode: scope === 'shared' ? 'add' : mode,
    version: now.version + 1,
    text,
    at: new Date().toISOString(),
    author: 'this browser',
    note: note ?? null,
  }
  store(world).versions.push(next)
  return next
}
