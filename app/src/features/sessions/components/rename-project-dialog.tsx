import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useUpdateTeam } from '../api/use-team'
import type { SessionEntry } from '../model/facets'

/** Renames a project for every session in it (set_project with rename), through one of its sessions. */
export function RenameProjectDialog({ project, member, onClose }: { project: string; member: SessionEntry; onClose: () => void }) {
  const [name, setName] = useState(project)
  const update = useUpdateTeam(member.daemon.id, member.session.id)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Rename project" description={`For every session in ${project}.`}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            update.mutate({ project: name.trim(), rename_project: true }, { onSuccess: onClose })
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required aria-label="Project name" autoFocus />
          {update.error ? <Banner tone="error">{update.error.message}</Banner> : null}
          <Button type="submit" disabled={update.isPending || !name.trim() || name.trim() === project}>
            Rename
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
