import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { usePairedDaemons } from '@/lib/daemons/store'
import { useCreateSession, useRuntimes } from '../api/use-session-mutations'

export function NewSessionDialog() {
  const daemons = usePairedDaemons()
  const [open, setOpen] = useState(false)
  const [daemonId, setDaemonId] = useState<string>('')
  const current = daemons.find((d) => d.id === daemonId) ?? daemons[0]
  const runtimes = useRuntimes(current?.id ?? '', open && !!current)
  const create = useCreateSession(current?.id ?? '')
  const navigate = useNavigate()
  const [runtime, setRuntime] = useState('claude-code')
  const [cwd, setCwd] = useState('')
  const [name, setName] = useState('')

  if (!daemons.length) return null
  const chip = (active: boolean) =>
    cn('rounded-full border px-3 py-1 text-sm', active ? 'border-accent bg-accent text-accent-fg' : 'border-border text-fg')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New session
        </Button>
      </DialogTrigger>
      <DialogContent title="New session" description="Starts an agent in a tmux session on the daemon's machine.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate(
              { runtime, cwd, name: name.trim() || null },
              {
                onSuccess: (session) => {
                  setOpen(false)
                  void navigate({ to: '/d/$daemonId/s/$sessionId', params: { daemonId: current!.id, sessionId: session.id } })
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
                  <button key={d.id} type="button" className={chip(d.id === current?.id)} onClick={() => setDaemonId(d.id)}>
                    {d.name}
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
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Directory
            <Input required placeholder="~/code/project" value={cwd} onChange={(e) => setCwd(e.target.value)} className="font-mono" />
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
