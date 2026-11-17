import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ink } from '@/components/ui/intents'
import type { Session } from '@/lib/api/types'
import { useState } from 'react'
import { useResumeArchived } from '../api/use-recovery'
import { agentOf, deviceOf } from '../model/facets'

/** An archived session started again, said first: where, and that its conversation goes on; its folder
 *  asked for when its own is gone (`resume_blocked.code` folder). Why it did not start is said here. */
export function ResumeDialog({ daemonId, session, onClose }: { daemonId: string; session: Session; onClose: () => void }) {
  const resume = useResumeArchived(daemonId, session.id)
  const gone = session.resume_blocked?.code === 'folder'
  const [folder, setFolder] = useState(gone ? '' : (session.cwd ?? ''))
  const where = deviceOf(session) ?? 'its machine'
  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent title={`Resume ${session.name}`}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            resume.mutate(gone ? folder.trim() : undefined, { onSuccess: onClose })
          }}
        >
          <p className={ink.body}>
            {agentOf(session)} starts again on {where}
            {gone ? '' : ` in ${session.cwd}`}, its conversation where it left off. Its name, role, project and pins stay; it leaves
            Archived. Nothing is sent to it.
          </p>
          {gone ? (
            <>
              <p className={ink.hint}>{session.resume_blocked?.reason}</p>
              <Input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                required
                aria-label="Folder to start it in"
                placeholder={`A folder on ${where}`}
                autoFocus
              />
            </>
          ) : null}
          {resume.error ? <Banner tone="error">{resume.error.message}</Banner> : null}
          <Button type="submit" disabled={resume.isPending || (gone && !folder.trim())}>
            Resume
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
