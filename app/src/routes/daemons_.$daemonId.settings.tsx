import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Pane, PaneBody, PaneHeader } from '@/components/ui/pane'
import { SettingsForm } from '@/features/daemons/components/settings-form'
import { DictionarySettings } from '@/features/voice/components/dictionary'
import { useDaemon } from '@/lib/daemons/store'

export const Route = createFileRoute('/daemons_/$daemonId/settings')({
  validateSearch: (search: Record<string, unknown>): { node?: string } =>
    typeof search.node === 'string' && search.node ? { node: search.node } : {},
  component: SettingsPage,
})

/** One machine's feature settings: a daemon's, or (`?node=`) a computer joined to it. */
function SettingsPage() {
  const { daemonId } = Route.useParams()
  const { node } = Route.useSearch()
  const daemon = useDaemon(daemonId)
  return (
    <Pane className="flex-1" aria-label="Settings">
      <PaneHeader
        leading={
          <Button asChild variant="ghost" size="icon-sm" aria-label="Back to Daemons">
            <Link to="/daemons">
              <ArrowLeft />
            </Link>
          </Button>
        }
        title={<h1>Settings</h1>}
        subtitle={node ? `${node} · through ${daemon?.name ?? 'its hub'}` : daemon?.name}
      />
      <PaneBody>
        <div className="mx-auto w-full max-w-2xl p-4">
          {daemon ? (
            <SettingsForm
              daemonId={daemonId}
              node={node}
              extras={node ? undefined : { 'Voice input': <DictionarySettings daemonId={daemonId} /> }}
            />
          ) : (
            <p className="text-sm text-fg-muted">Unknown daemon.</p>
          )}
        </div>
      </PaneBody>
    </Pane>
  )
}
