import { Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ProjectIcon } from '@/components/ui/project-hue'
import type { InboxItem } from '@/lib/api/types'
import type { InboxProject } from '../model/item'

/** Set project: any project (its colour dot), or none. A pick is kept at once. */
export function ProjectDialog({
  item,
  projects,
  onPick,
  onClose,
}: {
  item: InboxItem
  projects: InboxProject[]
  onPick: (project: string | null) => void
  onClose: () => void
}) {
  const pick = (project: string | null) => {
    if (project !== item.project) onPick(project)
    onClose()
  }
  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent title="Set project" description={<span className="line-clamp-2">“{item.text}”</span>}>
        <div role="radiogroup" aria-label="Project" className="flex max-h-[60dvh] flex-col gap-1 overflow-y-auto">
          <Button variant="option" role="radio" aria-checked={item.project === null} onClick={() => pick(null)} className="w-full">
            <span className="flex items-center gap-2">
              <Ban aria-hidden className="size-4" />
              No project
            </span>
          </Button>
          {projects.map((p) => (
            <Button
              key={p.name}
              variant="option"
              role="radio"
              aria-checked={item.project === p.name}
              onClick={() => pick(p.name)}
              className="w-full"
            >
              <span className="flex w-full min-w-0 items-center gap-2">
                <ProjectIcon hue={p.hue} className="size-4" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
