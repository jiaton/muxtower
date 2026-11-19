import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Pane, PaneBody, PaneHeader } from '@/components/ui/pane'
import { SettingsForm } from '@/features/daemons/components/settings-form'
import { DictionarySettings } from '@/features/voice/components/dictionary'
import { PlaybookSettings } from '@/features/playbook/components/playbook-settings'
import { SearchStatus } from '@/features/palette/components/search-status'
import { TriggersSettings } from '@/features/triggers/components/triggers-settings'
import { TtsSettings } from '@/features/voice/components/tts-settings'
import { useDaemon } from '@/lib/daemons/store'
import { ink } from '@/components/ui/intents'

export const Route = createFileRoute('/daemons_/$daemonId/settings')({
  validateSearch: (search: Record<string, unknown>): { node?: string; playbook?: string } => ({
    ...(typeof search.node === 'string' && search.node ? { node: search.node } : {}),
    // A project's playbook opened from its Team dialog ("edit").
    ...(typeof search.playbook === 'string' && search.playbook ? { playbook: search.playbook } : {}),
  }),
  component: SettingsPage,
})

/** One machine's feature settings: a daemon's, or (`?node=`) a computer joined to it. */
function SettingsPage() {
  const { daemonId } = Route.useParams()
  const { node, playbook } = Route.useSearch()
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
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
          {daemon ? (
            <>
              {playbook ? <PlaybookSettings daemonId={daemonId} project={playbook} /> : null}
              <SettingsForm
                daemonId={daemonId}
                node={node}
                extras={
                  node
                    ? undefined
                    : {
                        'Voice input': <DictionarySettings daemonId={daemonId} />,
                        Search: <SearchStatus daemonId={daemonId} />,
                        'Read aloud voice': <TtsSettings daemonId={daemonId} />,
                        // The hub's triggers, under the mode their sessions start in.
                        Triggers: playbook ? undefined : <TriggersSettings daemonId={daemonId} titled={false} />,
                      }
                }
              />
              {node || playbook ? null : <PlaybookSettings daemonId={daemonId} />}
            </>
          ) : (
            <p className={ink.hint}>Unknown daemon.</p>
          )}
        </div>
      </PaneBody>
    </Pane>
  )
}
