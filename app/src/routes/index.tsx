import { Link, createFileRoute } from '@tanstack/react-router'
import { useDaemonsStore } from '@/features/daemons/store'

export const Route = createFileRoute('/')({ component: Inbox })

function Inbox() {
  const count = useDaemonsStore((s) => s.daemons.length)
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">Inbox</h1>
      {count === 0 ? (
        <p className="text-fg-muted">
          No daemons yet.{' '}
          <Link to="/daemons" className="text-accent underline">
            Add one
          </Link>{' '}
          to see agents that need you.
        </p>
      ) : (
        <p className="text-fg-muted">Nothing needs you right now.</p>
      )}
    </section>
  )
}
