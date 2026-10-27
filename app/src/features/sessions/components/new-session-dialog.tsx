import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SuggestInput } from '@/components/ui/suggest-input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/cn'
import { usePairedDaemons } from '@/lib/daemons/store'
import { useNodes } from '@/lib/daemons/use-nodes'
import { useCreateSession, useRuntimes } from '../api/use-session-mutations'
import { useSessionEntries } from '../hooks/use-session-entries'
import { folderSuggestions } from '../model/query'

/** Starts a session on a daemon's machine, or on one of its nodes (another computer joined to it).
 *  `trigger`: the element that opens it (a button), defaulting to a labelled one. */
export function NewSessionDialog({ trigger }: { trigger?: ReactNode }) {
  const daemons = usePairedDaemons()
  const [open, setOpen] = useState(false)
  const [daemonId, setDaemonId] = useState<string>('')
  const [nodeName, setNodeName] = useState<string | null>(null)
  const current = daemons.find((d) => d.id === daemonId) ?? daemons[0]
  const nodes = (useNodes(current?.id ?? '', open && !!current).data ?? []).filter((n) => n.online)
  const node = nodes.find((n) => n.name === nodeName) ?? null
  const here = useRuntimes(current?.id ?? '', open && !!current)
  const runtimes = node ? { data: node.runtimes } : here
  const create = useCreateSession(current?.id ?? '')
  const navigate = useNavigate()
  const [runtime, setRuntime] = useState('claude-code')
  const [cwd, setCwd] = useState('')
  const [name, setName] = useState('')
  const [headless, setHeadless] = useState(false)
  const canRunHeadless = Boolean(runtimes.data?.find((r) => r.name === runtime)?.headless)
  const asHeadless = headless && canRunHeadless
  const { entries } = useSessionEntries()
  const folders = current ? folderSuggestions(entries, current.id, node?.name ?? null) : []

  if (!daemons.length) return null
  const chip = (active: boolean) =>
    cn('rounded-full border px-3 py-1 text-sm', active ? 'border-accent bg-accent text-accent-fg' : 'border-border text-fg')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> New session
          </Button>
        )}
      </DialogTrigger>
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
              { runtime, cwd, name: name.trim() || null, headless: asHeadless, node: node?.name ?? null },
              {
                onSuccess: (session) => {
                  setOpen(false)
                  void navigate({ to: '/d/$daemonId/s/$sessionId', params: { daemonId: current!.id, sessionId: session.id }, search: true })
                },
              },
            )
          }}
        >
          {daemons.length > 1 ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Daemon</legend>
              <div className="flex flex-wrap gap-2">
                {daemons.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={chip(d.id === current?.id)}
                    onClick={() => {
                      setDaemonId(d.id)
                      setNodeName(null)
                    }}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          {nodes.length ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Computer</legend>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={chip(node === null)} onClick={() => setNodeName(null)}>
                  {current?.name}
                </button>
                {nodes.map((n) => (
                  <button key={n.name} type="button" className={chip(n.name === node?.name)} onClick={() => setNodeName(n.name)}>
                    {n.name}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Agent</legend>
            <div className="flex flex-wrap gap-2">
              {(runtimes.data ?? []).map((r) => (
                <button
                  key={r.name}
                  type="button"
                  disabled={!r.available}
                  title={r.available ? undefined : `${r.binary} is not installed on this daemon`}
                  className={cn(chip(r.name === runtime), 'disabled:opacity-40')}
                  onClick={() => setRuntime(r.name)}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </fieldset>
          {canRunHeadless ? (
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              <span className="flex flex-col">
                Headless
                <span className="font-normal text-fg-muted">No terminal; its approvals and replies come here</span>
              </span>
              <Switch checked={headless} onCheckedChange={setHeadless} aria-label="Headless" />
            </label>
          ) : null}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Directory
            <SuggestInput
              required
              placeholder="~/code/project"
              value={cwd}
              onValueChange={setCwd}
              suggestions={folders.map((f) => ({ value: f.label, hint: `${f.count} session${f.count === 1 ? '' : 's'}` }))}
              className="font-mono"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name <span className="font-normal text-fg-muted">optional, defaults to the directory name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {create.isError ? <Banner tone="error">{create.error.message}</Banner> : null}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Starting…' : 'Start'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
