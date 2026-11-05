/**
 * A device's folders as a tree: a folder that lies inside another listed folder sits under it
 * (~/projects/shop and ~/projects/blog under ~/projects), named by the part below it. Only
 * folders that are listed become parents; none is made up to hold others. An item may name its parent
 * (`under`) and its name there instead: a worktree under its repository, wherever its folder is. One
 * whose label is no folder (a project) may say where it sits (`at`): it goes under the listed folder
 * that holds that, keeping its own name.
 */

export interface Nested<T> {
  item: T
  /** 0 for a folder inside no other listed one. */
  depth: number
  /** The folder it lies in, if listed. */
  parent?: string
  /** What to call it under its parent: the path below the parent's (its own label at the top). */
  name: string
  /** Its count with everything below it, and of those, how many need the owner. */
  total: number
  needsTotal: number
}

/** The folders of `folders` that `folder` lies in, the closest first. */
export function foldersAround(folder: string, folders: string[]): string[] {
  const inside = folders.filter((f) => f !== folder && folder.startsWith(f === '/' ? '/' : `${f}/`))
  return inside.sort((a, b) => b.length - a.length)
}

/** The folder of `folders` that `folder` lies in most closely, if any. */
const parentOf = (folder: string, folders: string[]): string | undefined => foldersAround(folder, folders)[0]

/** Where an item that sits at a folder (`at`) goes: in that folder when it is listed, else as `parentOf`. */
const holderOf = (at: string, folders: string[]): string | undefined => (folders.includes(at) ? at : parentOf(at, folders))

/** Folders in tree order: each followed by the ones inside it, the most sessions first at every level;
 *  `last` (the unknown folder) at the end, at the top level. */
export function nestFolders<
  T extends { label: string; count: number; needs?: number; under?: string; name?: string; at?: string; last?: boolean },
>(items: T[], last?: string): Nested<T>[] {
  const known = items.filter((i) => i.label !== last)
  const labels = known.map((i) => i.label)
  const listed = new Set(labels)
  const parents = new Map(
    known.map((i) => [
      i.label,
      i.under && listed.has(i.under)
        ? i.under
        : (i.at ? holderOf : parentOf)(
            i.at ?? i.label,
            labels.filter((l) => l !== i.label && !known.find((k) => k.label === l)?.under),
          ),
    ]),
  )
  const children = new Map<string | undefined, T[]>()
  for (const item of known) children.set(parents.get(item.label), [...(children.get(parents.get(item.label)) ?? []), item])
  const sum = (item: T, of: (i: T) => number): number => of(item) + (children.get(item.label) ?? []).reduce((n, c) => n + sum(c, of), 0)
  const total = (item: T) => sum(item, (i) => i.count)
  const needsTotal = (item: T) => sum(item, (i) => i.needs ?? 0)
  const order = (list: T[]) =>
    [...list].sort((a, b) => Number(Boolean(a.last)) - Number(Boolean(b.last)) || total(b) - total(a) || a.label.localeCompare(b.label))

  const out: Nested<T>[] = []
  const walk = (item: T, depth: number) => {
    const parent = parents.get(item.label)
    const name = item.name ?? (parent && !item.at ? item.label.slice(parent === '/' ? 1 : parent.length + 1) : item.label)
    out.push({ item, depth, parent, name, total: total(item), needsTotal: needsTotal(item) })
    for (const child of order(children.get(item.label) ?? [])) walk(child, depth + 1)
  }
  for (const root of order(children.get(undefined) ?? [])) walk(root, 0)
  for (const item of items.filter((i) => i.label === last))
    out.push({ item, depth: 0, name: item.label, total: item.count, needsTotal: item.needs ?? 0 })
  return out
}

/** Items with the repository each worktree is listed under, made (empty, by `empty`) where no session of
 *  it runs in its main folder, so its worktrees still sit under it. */
export function withRepositories<T extends { label: string; under?: string }>(items: T[], empty: (label: string) => T): T[] {
  const listed = new Set(items.map((i) => i.label))
  const missing = [...new Set(items.flatMap((i) => (i.under && !listed.has(i.under) ? [i.under] : [])))]
  return [...items, ...missing.map(empty)]
}
