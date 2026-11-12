/**
 * The session list as one tree, built from its groups by pure functions: groups (sticky headers), their
 * sections (a device's folders, nested as the folders are), and rows, each with the forks listed under it
 * (a tree of its own, with the lines that join it) and the side chats folded under it. What is folded is
 * read once, here; the components only draw the tree.
 */
import type { SessionEntry } from './facets'
import { shortFolderNames } from './facets'
import { forksUnder } from './forks'
import type { PlaceKind } from './places'
import type { Group, Implied, Section } from './query'

/** A key of what can be folded (`useListPrefs.collapsed`): a grouping's group or section, or a row's forks. */
export const foldKey = (...parts: string[]) => parts.join('\u0000')

export interface FoldState {
  /** What folds are kept per (the grouping); none: nothing folds. */
  scope?: string
  collapsed: readonly string[]
  /** Groups start folded until opened (`collapsed` then holds the opened ones). */
  foldedFirst?: boolean
  /** Everything shows (a search). */
  unfolded?: boolean
}

export interface Held {
  /** The side chats each row holds (`foldSideChats`), folded under it. */
  sideChats?: Map<string, SessionEntry[]>
  /** The forks each row holds (`foldForks`), listed under it as a tree. */
  forks?: Map<string, SessionEntry[]>
}

export interface RowNode {
  kind: 'row'
  key: string
  entry: SessionEntry
  sideChats?: SessionEntry[]
  /** Its forks, as rows one level deeper; shown when `forksOpen`. */
  forks: RowNode[]
  /** How many forks it holds, theirs included (counted while folded). */
  forkCount: number
  forkUnread: number
  forksKey: string
  forksOpen: boolean
  /** A fork in there needs you: its forks stay open, and cannot be folded. */
  forksAsking: boolean
  /** In a fork tree: how deep, the ancestors' rails that go on past it, and whether it is its parent's last. */
  depth: number
  rails: boolean[]
  last: boolean
}

export interface Counted {
  /** Sessions it holds (forks included, as the header counts them), and of them how many need you. */
  count: number
  needs: number
}

export interface SectionNode extends Counted {
  kind: 'section'
  /** Its fold key (`foldKey(scope, group, section)`). */
  key: string
  id: string
  label: string
  title: string
  placeKind?: PlaceKind
  depth: number
  folded: boolean
  foldable: boolean
  /** Its rows, then the folders inside it. */
  children: (RowNode | SectionNode)[]
}

export interface GroupNode extends Counted {
  kind: 'group'
  key: string
  id: string
  label: string
  implies: Implied
  /** A device's group: its folders are sections. */
  sectioned: boolean
  folded: boolean
  foldable: boolean
  children: (RowNode | SectionNode)[]
}

const needing = (entries: SessionEntry[]) => entries.filter((e) => e.session.needs_attention).length
const withForks = (entries: SessionEntry[], forks?: Map<string, SessionEntry[]>) =>
  forks ? entries.flatMap((e) => [e, ...forksUnder(e.key, forks)]) : entries

/** A row and the fork tree under it. */
export function rowOf(
  entry: SessionEntry,
  held: Held,
  collapsed: readonly string[],
  depth = 0,
  rails: boolean[] = [],
  last = true,
): RowNode {
  const forkEntries = held.forks?.get(entry.key) ?? []
  const under = held.forks ? forksUnder(entry.key, held.forks) : []
  const forksKey = foldKey('forks', entry.key)
  const forksAsking = under.some((e) => e.session.needs_attention)
  // The forks' rails: an ancestor's goes on past them while it has more forks below (none at the top).
  const childRails = depth ? [...rails, !last] : rails
  return {
    kind: 'row',
    key: entry.key,
    entry,
    sideChats: held.sideChats?.get(entry.key),
    forks: forkEntries.map((fork, i) => rowOf(fork, held, collapsed, depth + 1, childRails, i === forkEntries.length - 1)),
    forkCount: forkEntries.length,
    forkUnread: forkEntries.filter((e) => e.session.unread).length,
    forksKey,
    forksOpen: forkEntries.length > 0 && (!collapsed.includes(forksKey) || forksAsking),
    forksAsking,
    depth,
    rails,
    last,
  }
}

/** The list's tree: each group with its sections (nested) or rows, what is folded, and what each counts. */
export function buildList(groups: Group[], held: Held, folds: FoldState): GroupNode[] {
  const foldable = folds.scope !== undefined && !folds.unfolded
  const key = (...parts: string[]) => foldKey(folds.scope ?? '', ...parts)
  const rows = (entries: SessionEntry[]) => entries.map((e) => rowOf(e, held, folds.collapsed))
  return groups.map((group) => {
    const groupKey = key(group.key)
    const folded = foldable && folds.collapsed.includes(groupKey) !== Boolean(folds.foldedFirst)
    const all = withForks(group.entries, held.forks)
    return {
      kind: 'group',
      key: groupKey,
      id: group.key,
      label: group.label,
      implies: group.implies,
      sectioned: Boolean(group.sections),
      folded,
      foldable,
      count: all.length,
      needs: folded ? needing(all) : 0,
      children: group.sections ? sectionsOf(group, group.sections, held, folds, foldable, key) : rows(group.entries),
    }
  })
}

function sectionsOf(
  group: Group,
  sections: Section[],
  held: Held,
  folds: FoldState,
  foldable: boolean,
  key: (...parts: string[]) => string,
): SectionNode[] {
  const names = shortFolderNames(sections.filter((s) => !s.depth).map((s) => s.label))
  const nodes = new Map<string, SectionNode>()
  const top: SectionNode[] = []
  const inner = new Map<string, SectionNode[]>() // the folders inside each, in tree order
  for (const section of sections) {
    const sectionKey = key(group.key, section.key)
    const depth = section.depth ?? 0
    const node: SectionNode = {
      kind: 'section',
      key: sectionKey,
      id: section.key,
      label: depth ? (section.name ?? section.label) : (names.get(section.label) ?? section.label),
      title: section.title ?? section.label,
      placeKind: section.kind,
      depth,
      folded: foldable && folds.collapsed.includes(sectionKey), // only groups start folded
      foldable,
      count: 0,
      needs: 0,
      children: section.entries.map((e) => rowOf(e, held, folds.collapsed)),
    }
    nodes.set(section.key, node)
    const parent = section.parent ? nodes.get(section.parent) : undefined
    if (parent) inner.set(section.parent!, [...(inner.get(section.parent!) ?? []), node])
    else top.push(node)
  }
  // Each folder's own rows, then the folders inside it; counts: its own sessions, or, folded, everything
  // it holds (the folders inside it and every row's forks), with how many of them need you.
  const finish = (node: SectionNode, section: Section): SectionNode => {
    const children = inner.get(section.key) ?? []
    node.children.push(...children)
    const holds = heldIn(node).map((r) => r.entry)
    const all = withForks(holds, held.forks)
    node.count = node.folded ? all.length : section.entries.length
    node.needs = node.folded ? needing(all) : 0
    return node
  }
  const bySection = new Map(sections.map((s) => [s.key, s]))
  // Inner folders first (deepest last in the list: finish children before their parents).
  for (const section of [...sections].reverse()) finish(nodes.get(section.key)!, bySection.get(section.key)!)
  return top
}

/** The rows a section holds, with those of the folders inside it, in list order. */
export function heldIn(node: SectionNode): RowNode[] {
  return node.children.flatMap((child) => (child.kind === 'row' ? [child] : heldIn(child)))
}

/** Every row the tree shows, in order (folded groups, sections and fork trees left out): for tests, and
 *  for what moved between renders. */
export function shownRows(nodes: (GroupNode | SectionNode | RowNode)[]): RowNode[] {
  return nodes.flatMap((node) => {
    if (node.kind === 'row') return [node, ...(node.forksOpen ? shownRows(node.forks) : [])]
    return node.folded ? [] : shownRows(node.children)
  })
}
