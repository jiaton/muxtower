import { createFileRoute } from '@tanstack/react-router'
import { KeyRound, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Pane, PaneBody, PaneHeader } from '@/components/ui/pane'
import { DaemonCard } from '@/features/daemons/components/daemon-card'
import { Diagnostics } from '@/features/daemons/components/diagnostics'
import { VoiceCommandsSettings } from '@/features/voice/components/voice-commands-settings'
import { PresetWarning } from '@/features/daemons/components/preset-warning'
import { InstallApp } from '@/features/install/components/install-app'
import { AddDaemonDialog } from '@/features/pairing/components/add-daemon-dialog'
import { ShareDevicesDialog } from '@/features/pairing/components/share-devices-dialog'
import { PushToggle } from '@/features/push/components/push-toggle'
import { useOwnDaemons, usePairedDaemons } from '@/lib/daemons/store'
import { text, textRole } from '@/components/ui/styles'

export const Route = createFileRoute('/daemons')({ component: DaemonsPage })

function DaemonsPage() {
  const daemons = useOwnDaemons()
  const paired = usePairedDaemons()
  const [adding, setAdding] = useState<{ url?: string } | null>(null)

  return (
    <Pane className="flex-1" aria-label="Daemons">
      <PaneHeader
        title={<h1>Daemons</h1>}
        subtitle="The machines whose agents this device sees"
        actions={
          <Button size="sm" onClick={() => setAdding({})}>
            <Plus /> Add
          </Button>
        }
      />
      <PaneBody>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
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
              Run <code className={text({ mono: true })}>muxtower pair</code> where your agents run, then tap Add.
            </EmptyState>
          )}
          <InstallApp />
          <Diagnostics />
          <VoiceCommandsSettings />
          {paired.length ? (
            <section className="flex flex-col gap-2">
              <h2 className={textRole.label}>Other devices</h2>
              <p className={textRole.hint}>
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
      </PaneBody>
    </Pane>
  )
}
