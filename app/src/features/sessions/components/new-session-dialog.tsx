import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { createDaemonClient } from '@/lib/api/client'
import { useDaemonMe } from '@/features/daemons/api/use-daemon-me'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SuggestInput } from '@/components/ui/suggest-input'
import { Switch } from '@/components/ui/switch'

import { usePairedDaemons } from '@/lib/daemons/store'
import { useNodes } from '@/lib/daemons/use-nodes'
import { useCreateSession, useRuntimes } from '../api/use-session-mutations'
import { useSessionEntries } from '../hooks/use-session-entries'
import { folderSuggestions } from '../model/counts'
import { agentName } from '../model/facets'
import { useNewSessionPrefs } from '../store'
import { AgentMark } from './agent-mark'

/** Starts a session on a daemon's machine, or on one of its nodes (another computer joined to it).
 *  `trigger`: the element that opens it (a button), defaulting to a labelled one. `preset` (a team card's
 *  "New session here…"): where, and the project it joins, with a role to give it; opened by `open`. */
import { splitArgs } from '../model/launch'
import { LaunchOptions } from './launch-options'
import { Label } from '@/components/ui/label'
import { chip } from '@/components/ui/chip'
import { ink } from '@/components/ui/intents'
export interface NewSessionPreset {
  daemonId: string
  node: string | null
  cwd: string
  project: string
}

export function NewSessionDialog({
  trigger,
  preset,
  open: shown,
  onOpenChange,
}: {
  trigger?: ReactNode
  preset?: NewSessionPreset
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const daemons = usePairedDaemons()
  const [opened, setOpened] = useState(false)
  const open = shown ?? opened
  const setOpen = (value: boolean) => (onOpenChange ? onOpenChange(value) : setOpened(value))
  const [daemonId, setDaemonId] = useState<string>(preset?.daemonId ?? '')
  const [nodeName, setNodeName] = useState<string | null>(preset?.node ?? null)
  const [role, setRole] = useState('')
  const current = daemons.find((d) => d.id === daemonId) ?? daemons[0]
  const nodes = (useNodes(current?.id ?? '', open && !!current).data ?? []).filter((n) => n.online)
  const node = nodes.find((n) => n.name === nodeName) ?? null
  const here = useRuntimes(current?.id ?? '', open && !!current)
  const runtimes = node ? { data: node.runtimes } : here
  const create = useCreateSession(current?.id ?? '')
  const navigate = useNavigate()
  const lastRuntime = useNewSessionPrefs((s) => s.runtime)
  const rememberRuntime = useNewSessionPrefs((s) => s.setRuntime)
  const [picked, setRuntime] = useState<string | null>(null)
  // the agent picked here, else the one started last, as long as this computer has it
  const available = (runtimes.data ?? []).filter((r) => r.available).map((r) => r.name)
  const runtime = picked ?? (available.includes(lastRuntime) || !available.length ? lastRuntime : available[0])
  const [typed, setCwd] = useState<string | null>(preset?.cwd ?? null)
  const [name, setName] = useState('')
  const [headless, setHeadless] = useState(false)
  const [mode, setMode] = useState<string | null>(null)
  const [extra, setExtra] = useState('')
  const canRunHeadless = Boolean(runtimes.data?.find((r) => r.name === runtime)?.headless)
  const asHeadless = headless && canRunHeadless
  const me = useDaemonMe(current?.id ?? '')
  // The machine's default folder until one is typed (recent folders stay suggestions).
  const fallback = (node ? node.default_folder : me.data?.default_folder) ?? ''
  const cwd = typed ?? fallback
  const { entries } = useSessionEntries()
  const folders = current ? folderSuggestions(entries, current.id, node?.name ?? null) : []

  if (!daemons.length) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {preset && !trigger ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">
              <Plus /> New session
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent
        title="New session"
        description={
          asHeadless
            ? `Starts an agent without a terminal on ${node?.name ?? "the daemon's machine"}: talk to it here.`
            : `Starts an agent in a tmux session on ${node?.name ?? "the daemon's machine"}.`
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate(
              {
                runtime, cwd: cwd.trim() || null, name: name.trim() || null, headless: asHeadless, node: node?.name ?? null,
                permission_mode: asHeadless ? null : mode, args: asHeadless ? [] : splitArgs(extra),
              }, // prettier-ignore
              {
                onSuccess: async (session) => {
                  if (preset) {
                    const body = { project: preset.project, rename_project: false, ...(role.trim() ? { role: role.trim() } : {}) }
                    await createDaemonClient(current!).PUT('/v1/sessions/{session_id}/team', {
                      params: { path: { session_id: session.id } },
                      body,
                    })
                  }
                  rememberRuntime(runtime)
                  setOpen(false)
                  void navigate({ to: '/d/$daemonId/s/$sessionId', params: { daemonId: current!.id, sessionId: session.id }, search: true })
                },
              },
            )
          }}
        >
          {daemons.length > 1 ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className={`${ink.label} mb-1.5`}>Daemon</legend>
              <div className="flex flex-wrap gap-2">
                {daemons.map((d) => (
                  <Button
                    key={d.id}
                    variant="plain"
                    aria-pressed={d.id === current?.id}
                    className={chip({ kind: 'choice' })}
                    onClick={() => {
                      setDaemonId(d.id)
                      setNodeName(null)
                    }}
                  >
                    {d.name}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : null}
          {nodes.length ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className={`${ink.label} mb-1.5`}>Computer</legend>
              <div className="flex flex-wrap gap-2">
                <Button variant="plain" aria-pressed={node === null} className={chip({ kind: 'choice' })} onClick={() => setNodeName(null)}>
                  {current?.name}
                </Button>
                {nodes.map((n) => (
                  <Button
                    key={n.name}
                    variant="plain"
                    aria-pressed={n.name === node?.name}
                    className={chip({ kind: 'choice' })}
                    onClick={() => setNodeName(n.name)}
                  >
                    {n.name}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : null}
          <fieldset>
            <legend className={`${ink.label} mb-1.5`}>Agent</legend>
            <div className="flex flex-wrap gap-2">
              {(runtimes.data ?? []).map((r) => (
                <Button
                  key={r.name}
                  variant="plain"
                  aria-pressed={r.name === runtime}
                  disabled={!r.available}
                  title={r.available ? undefined : `${r.binary} is not installed on this daemon`}
                  className={chip({ kind: 'choice' })}
                  onClick={() => setRuntime(r.name)}
                >
                  <AgentMark decorative agent={agentName(r.name)} />
                  {agentName(r.name)}
                </Button>
              ))}
            </div>
          </fieldset>
          {canRunHeadless ? (
            <label className={`${ink.label} flex items-center justify-between gap-3`}>
              <span className="flex flex-col">
                Headless
                <span className={ink.aside}>No terminal; its approvals and replies come here</span>
              </span>
              <Switch checked={headless} onCheckedChange={setHeadless} aria-label="Headless" />
            </label>
          ) : null}
          <Label>
            Directory
            <SuggestInput
              required={!fallback}
              placeholder="~/code/project"
              value={cwd}
              onValueChange={setCwd}
              suggestions={folders.map((f) => ({ value: f.label, hint: `${f.count} session${f.count === 1 ? '' : 's'}` }))}
              className={ink.code}
            />
          </Label>
          <Label>
            Name <span className={ink.aside}>optional, defaults to the directory name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Label>
          {preset ? (
            <Label>
              Role in {preset.project} <span className={ink.aside}>optional</span>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. reviewer" />
            </Label>
          ) : null}
          {asHeadless ? null : (
            <LaunchOptions
              runtime={runtimes.data?.find((r) => r.name === runtime)}
              mode={mode}
              onMode={setMode}
              extra={extra}
              onExtra={setExtra}
            />
          )}
          {create.isError ? <Banner tone="error">{create.error.message}</Banner> : null}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Starting…' : 'Start'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
