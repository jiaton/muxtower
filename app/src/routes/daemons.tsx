import { createFileRoute } from '@tanstack/react-router'
import { KeyRound, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { DaemonCard } from '@/features/daemons/components/daemon-card'
import { PresetWarning } from '@/features/daemons/components/preset-warning'
import { AddDaemonDialog } from '@/features/pairing/components/add-daemon-dialog'
import { ShareDevicesDialog } from '@/features/pairing/components/share-devices-dialog'
import { PushToggle } from '@/features/push/components/push-toggle'
import { useDaemonsStore, usePairedDaemons } from '@/lib/daemons/store'

export const Route = createFileRoute('/daemons')({ component: DaemonsPage })

function DaemonsPage() {
  const daemons = useDaemonsStore((s) => s.daemons)
  const paired = usePairedDaemons()
  const [adding, setAdding] = useState<{ url?: string } | null>(null)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Daemons</h1>
        <Button size="sm" onClick={() => setAdding({})}>
          <Plus /> Add
        </Button>
      </div>
      <PresetWarning />
      {daemons.length ? (
        <div className="flex flex-col gap-3">
          {daemons.map((d) => (
            <DaemonCard
              key={d.id}
              daemon={d}
              actions={
                d.token && !d.rejected ? (
                  <PushToggle daemonId={d.id} />
                ) : (
                  <Button className="self-start" onClick={() => setAdding({ url: d.url })}>
                    <KeyRound /> Enter pairing code
                  </Button>
                )
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No daemons yet">
          Run <code className="font-mono">muxtower pair</code> where your agents run, then tap Add.
        </EmptyState>
      )}
      {paired.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Other devices</h2>
          <p className="text-sm text-fg-muted">
            Show a QR code that pairs another phone or computer with every daemon here, without typing anything.
          </p>
          <ShareDevicesDialog />
        </section>
      ) : null}
      <AddDaemonDialog
        key={adding?.url ?? 'new'}
        open={adding !== null}
        onOpenChange={(open) => !open && setAdding(null)}
        initialUrl={adding?.url}
      />
    </div>
  )
}
