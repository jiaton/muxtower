import { createFileRoute } from '@tanstack/react-router'
import { Card } from '@/components/ui/card'
import { AddDaemonForm } from '@/features/daemons/components/add-daemon-form'
import { DaemonCard } from '@/features/daemons/components/daemon-card'
import { useDaemonsStore } from '@/features/daemons/store'

export const Route = createFileRoute('/daemons')({ component: Daemons })

function Daemons() {
  const daemons = useDaemonsStore((s) => s.daemons)
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Daemons</h1>
      <div className="flex flex-col gap-2">
        {daemons.map((d) => (
          <DaemonCard key={d.id} daemon={d} />
        ))}
      </div>
      <Card>
        <h2 className="mb-3 font-medium">Add a daemon</h2>
        <AddDaemonForm />
      </Card>
    </section>
  )
}
