import { KeyRound, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import type { Trigger } from '@/lib/api/types'
import { useCreateTrigger, useDeleteTrigger, useRotateSecret, useUpdateTrigger } from '../api/use-triggers'
import { draftOf, EMPTY_DRAFT, patchOf, specOf } from '../model/draft'
import { FiringLog } from './firing-log'
import { SecretPanel } from './secret-panel'
import { TestPanel } from './test-panel'
import { TriggerForm } from './trigger-form'

const WIDE = 'sm:max-w-xl'

/** Asks before something that cannot be undone. */
function Confirm({
  title,
  description,
  confirm,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string
  description: string
  confirm: string
  pending: boolean
  error: Error | null
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={title} description={description}>
        {error ? <Banner tone="error">{error.message}</Banner> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={pending} onClick={onConfirm}>
            {confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** A new trigger: its settings, then (made) its secret, this once. */
export function NewTriggerDialog({ daemonId, onClose }: { daemonId: string; onClose: () => void }) {
  const create = useCreateTrigger(daemonId)
  const made = create.data
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={made ? `${made.trigger.name} is ready` : 'New trigger'}
        description={made ? undefined : 'Turns an event from outside (a webhook, a script) into a message, a new session, or a notification.'}
        className={WIDE}
      >
        {made ? (
          <SecretPanel daemonId={daemonId} trigger={made.trigger} secret={made.secret} onDone={onClose} />
        ) : (
          <TriggerForm
            daemonId={daemonId}
            initial={EMPTY_DRAFT}
            submitLabel="Create"
            pending={create.isPending}
            error={create.error}
            onSubmit={(draft) => create.mutate(specOf(draft))}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

type Tab = 'settings' | 'test' | 'log'

/** One trigger: its settings (and Rotate secret, Delete), a test firing, and its log. */
export function TriggerDialog({ daemonId, trigger, onClose }: { daemonId: string; trigger: Trigger; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('settings')
  const [asking, setAsking] = useState<'delete' | 'rotate' | null>(null)
  const update = useUpdateTrigger(daemonId)
  const remove = useDeleteTrigger(daemonId)
  const rotate = useRotateSecret(daemonId)
  const secret = rotate.data
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={trigger.name} description={trigger.enabled ? undefined : 'Paused: its firings are logged, not acted on.'} className={WIDE}>
        {secret ? (
          <SecretPanel daemonId={daemonId} trigger={trigger} secret={secret} onDone={() => rotate.reset()} />
        ) : (
          <>
            <Segmented
              aria-label="Show"
              value={tab}
              options={[
                { value: 'settings', label: 'Settings' },
                { value: 'test', label: 'Test' },
                { value: 'log', label: 'Log' },
              ]}
              onChange={setTab}
            />
            {tab === 'settings' ? (
              <TriggerForm
                key={trigger.updated_at}
                daemonId={daemonId}
                initial={draftOf(trigger)}
                submitLabel="Save"
                pending={update.isPending}
                error={update.error}
                onSubmit={(draft) => update.mutate({ id: trigger.id, patch: patchOf(draft) }, { onSuccess: onClose })}
                footer={
                  <>
                    <Button variant="ghost" tone="danger" onClick={() => setAsking('delete')}>
                      <Trash2 />
                      Delete
                    </Button>
                    <Button variant="ghost" onClick={() => setAsking('rotate')}>
                      <KeyRound />
                      Rotate secret
                    </Button>
                  </>
                }
              />
            ) : tab === 'test' ? (
              <TestPanel daemonId={daemonId} trigger={trigger} />
            ) : (
              <FiringLog daemonId={daemonId} triggerId={trigger.id} />
            )}
          </>
        )}
        {asking === 'delete' ? (
          <Confirm
            title={`Delete ${trigger.name}?`}
            description="Its secret stops working and its log goes with it. This cannot be undone."
            confirm="Delete"
            pending={remove.isPending}
            error={remove.error}
            onConfirm={() => remove.mutate(trigger.id, { onSuccess: onClose })}
            onClose={() => setAsking(null)}
          />
        ) : asking === 'rotate' ? (
          <Confirm
            title={`A new secret for ${trigger.name}?`}
            description="The old one stops working at once: whatever sends it events needs the new one."
            confirm="Rotate"
            pending={rotate.isPending}
            error={rotate.error}
            onConfirm={() => rotate.mutate(trigger.id, { onSuccess: () => setAsking(null) })}
            onClose={() => setAsking(null)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
