import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MAX_NAME, MAX_PROJECTS, OTHER, projectLabel, type ChipGroup } from '../model/chip-groups'

/** A group of projects, new (`group` undefined) or to edit: a name and the projects it holds, picked from
 *  those of the sessions (most recently active first; Other last) and any it held already. */
export function ChipGroupDialog({
  group,
  projects,
  error,
  pending,
  onSave,
  onClose,
}: {
  group?: ChipGroup
  projects: string[]
  error?: Error | null
  pending?: boolean
  onSave: (name: string, projects: string[]) => void
  onClose: () => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [picked, setPicked] = useState<string[]>(group?.projects ?? [])
  const known = projects.filter((p) => p !== OTHER)
  const kept = picked.filter((p) => p !== OTHER && !known.includes(p)) // held, though no session has it now
  const choices = [...known, ...kept, OTHER]
  const full = picked.length >= MAX_PROJECTS
  const toggle = (project: string) => setPicked((now) => (now.includes(project) ? now.filter((p) => p !== project) : [...now, project]))
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={group ? 'Edit group' : 'New group'}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            onSave(
              name.trim(),
              choices.filter((p) => picked.includes(p)),
            )
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME}
            required
            aria-label="Group name"
            placeholder="Name"
            autoFocus={!group}
          />
          <fieldset className="flex max-h-72 flex-col overflow-y-auto">
            <legend className="mb-1 text-xs text-fg-muted">Projects</legend>
            {choices.map((project) => (
              <label key={project} className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-surface-muted">
                <Checkbox
                  checked={picked.includes(project)}
                  disabled={full && !picked.includes(project)}
                  onChange={() => toggle(project)}
                />
                <span className="min-w-0 truncate">{projectLabel(project)}</span>
              </label>
            ))}
          </fieldset>
          {error ? <Banner tone="error">{error.message}</Banner> : null}
          <Button type="submit" disabled={pending || !name.trim() || !picked.length}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
