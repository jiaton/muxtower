import { Boxes, Folder, FolderGit2, GitBranch } from 'lucide-react'
import type { PlaceKind } from '../model/places'

const ICONS = { project: Boxes, repository: FolderGit2, worktree: GitBranch, folder: Folder }

/** A device's place by its kind: a project someone named, a repository, one of its worktrees, a folder. */
export function PlaceIcon({ kind }: { kind?: PlaceKind }) {
  const Icon = ICONS[kind ?? 'folder']
  return <Icon aria-hidden />
}
