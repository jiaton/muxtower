import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ink } from '@/components/ui/intents'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ProjectIcon } from '@/components/ui/project-hue'
import { useHandoffTargets, useSaveHandoff } from '@/lib/handoff'
import { useProjectHue } from '../api/use-project-colours'

/**
 * A project's default hand-off role: who its Inbox items go to unless the owner picks another (Hand to… has it
 * picked to begin with). Free text, as roles are; the roles its sessions hold now are offered. Clear: none.
 */
export function HandoffRoleDialog({ project, onClose }: { project: string; onClose: () => void }) {
  const targets = useHandoffTargets(project)
  const save = useSaveHandoff()
  const hue = useProjectHue(project)
  const [typed, setTyped] = useState<string | null>(null)
  const current = targets.data?.default_role ?? ''
  const role = typed ?? current
  const keep = (value: string | null) => save.mutate({ project, role: value?.trim() || null }, { onSuccess: onClose })
  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent
        title="Default hand-off role"
        titleIcon={<ProjectIcon hue={hue} className="size-4" />}
        description={`Inbox items for ${project} go to whoever holds it, unless you pick someone else.`}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            keep(role)
          }}
        >
          <Label>
            Role
            <Input autoFocus value={role} placeholder="A role in this project" onChange={(e) => setTyped(e.target.value)} />
          </Label>
          {targets.data?.roles.length ? (
            <div role="group" aria-label="Roles held now" className="flex flex-wrap gap-2">
              {targets.data.roles.map((r) => (
                <Button
                  key={r.role}
                  variant="outline"
                  size="sm"
                  aria-pressed={r.role.toLowerCase() === role.trim().toLowerCase()}
                  onClick={() => setTyped(r.role)}
                >
                  {r.role}
                </Button>
              ))}
            </div>
          ) : targets.data ? (
            <p className={ink.hint}>No session holds a role in {project} yet.</p>
          ) : null}
          {save.isError ? <Banner tone="error">{save.error.message}</Banner> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {current ? (
              <Button variant="ghost" className="mr-auto" disabled={save.isPending} onClick={() => keep(null)}>
                Clear
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || role.trim() === current}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
