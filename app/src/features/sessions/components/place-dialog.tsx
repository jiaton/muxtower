import { ScanSearch } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { SuggestInput } from '@/components/ui/suggest-input'
import type { Session } from '@/lib/api/types'
import { useDetectPlacement, usePlaceSession } from '../api/use-placement'
import { useSessionEntries } from '../hooks/use-session-entries'
import { NO_ENVIRONMENT, deviceOf, folderOf } from '../model/facets'
import { facetsOf } from '../model/query'

const count = (n: number) => `${n} session${n === 1 ? '' : 's'}`

/** Where a session runs, set by the owner when its source does not say (`capabilities.place`): a device
 *  and a folder, picked from those the lists already show or typed. Detect fills in the folder its whole
 *  log names, for the owner to check and save. Clear goes back to what its source says. */
export function PlaceDialog({ daemonId, session, onClose }: { daemonId: string; session: Session; onClose: () => void }) {
  const place = usePlaceSession(daemonId, session.id)
  const detect = useDetectPlacement(daemonId, session.id)
  const { entries } = useSessionEntries()
  const devices = facetsOf(entries).devices.filter((d) => d.label !== NO_ENVIRONMENT)
  const [device, setDevice] = useState(session.placement?.machine ?? deviceOf(session) ?? '')
  const [folder, setFolder] = useState(session.placement?.folder ?? folderOf(session) ?? '')
  const folders = devices.find((d) => d.label === device.trim())?.folders ?? []
  const save = () => place.mutate({ machine: device.trim() || null, folder: folder.trim() || null }, { onSuccess: onClose })

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent title={`Where ${session.name} runs`} description="Its source does not say. Placed here, it is listed there on every device.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Device
            <SuggestInput
              placeholder="Mac"
              value={device}
              onValueChange={setDevice}
              maxLength={80}
              suggestions={devices.map((d) => ({ value: d.label, hint: count(d.count) }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Folder <span className="font-normal text-fg-muted">optional</span>
            <SuggestInput
              placeholder="~/code/project"
              value={folder}
              onValueChange={setFolder}
              maxLength={500}
              suggestions={folders.map((f) => ({ value: f.label, hint: count(f.count) }))}
              className="font-mono"
            />
          </label>
          <div className="flex flex-col items-start gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={detect.isPending}
              onClick={() => detect.mutate(undefined, { onSuccess: (found) => found.folder && setFolder(found.folder) })}
            >
              <ScanSearch /> {detect.isPending ? 'Reading its log…' : 'Detect the folder'}
            </Button>
            <p className="text-xs text-fg-muted">
              {detect.data
                ? detect.data.folder
                  ? `Its tool calls ran in ${detect.data.folder}. Save to place it there.`
                  : 'Its log names no folder: place it by hand.'
                : 'Reads its whole log for the folder its tool calls ran in.'}
            </p>
          </div>
          {place.error ? <Banner tone="error">{place.error.message}</Banner> : null}
          {detect.error ? <Banner tone="error">{detect.error.message}</Banner> : null}
          <div className="flex justify-end gap-2">
            {session.placement ? (
              <Button type="button" variant="ghost" disabled={place.isPending} onClick={() => place.mutate({}, { onSuccess: onClose })}>
                Clear
              </Button>
            ) : null}
            <Button type="submit" disabled={place.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
