import { createFileRoute } from '@tanstack/react-router'
import { PanelLeft } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export const Route = createFileRoute('/_sessions/')({ component: NoSession })

/** Beside the list (from `md`) while no session is open. */
function NoSession() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState icon={<PanelLeft />} title="Pick a session">
        Its terminal or conversation opens here, next to the list.
      </EmptyState>
    </div>
  )
}
