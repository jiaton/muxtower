import { Link } from '@tanstack/react-router'
import { Check, Copy, MonitorSmartphone, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/ui/status-dot'
import { useNodes } from '@/lib/daemons/use-nodes'
import { useJoinCode, useRemoveNode } from '../api/use-nodes'

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : 'never')

/** Other computers joined to this daemon (its nodes): their sessions are listed and driven through it,
 *  so this device needs no address of theirs. Joining one is a command on that computer, with a code
 *  made here; removing one drops its sessions. */
export function NodesList({ daemonId, url }: { daemonId: string; url: string }) {
  const nodes = useNodes(daemonId)
  const remove = useRemoveNode(daemonId)
  const join = useJoinCode(daemonId)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const command = join.data ? `muxtower pair --join ${url} --code ${join.data.code}` : null
  const list = nodes.data ?? []

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Computers joined to it</h3>
      {list.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {list.map((n) => (
            <li key={n.name} className="flex items-center gap-2 px-3 py-2 text-sm">
              <StatusDot tone={n.online ? 'ok' : 'idle'} label={n.online ? 'Online' : 'Offline'} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{n.name}</span>
                <span className="truncate text-xs text-fg-muted">
                  {n.online ? 'online' : `offline since ${when(n.last_seen)}`} · {n.sessions} session{n.sessions === 1 ? '' : 's'}
                </span>
                {n.update ? (
                  <span className="text-xs text-state-permission">
                    Runs {n.version}; update it to {n.update}: <code className="font-mono break-all">pipx install --force muxtower=={n.update}</code>
                  </span>
                ) : null}
              </span>
              {n.online ? (
                <Button asChild variant="ghost" size="icon-sm" aria-label={`Settings of ${n.name}`} title="Settings">
                  <Link to="/daemons/$daemonId/settings" params={{ daemonId }} search={{ node: n.name }}>
                    <Settings2 />
                  </Link>
                </Button>
              ) : null}
              {confirm === n.name ? (
                <Button variant="danger" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(n.name)}>
                  Remove {n.name}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirm(n.name)} aria-label={`Remove ${n.name}`}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">None. Another computer running muxtower can join this one, and its sessions show here too.</p>
      )}
      {command ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-muted p-3 text-sm">
          <p>On that computer, with muxtower installed, run:</p>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 font-mono text-xs break-all">{command}</code>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy the command"
              onClick={() =>
                void navigator.clipboard?.writeText(command).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
          <p className="text-xs text-fg-muted">
            The code works once, until {new Date(join.data!.expires_at).toLocaleTimeString()}. If a sign-in gate is in front of this
            daemon, give that computer its token first: <code className="font-mono">[hub] headers</code> in its config.
          </p>
        </div>
      ) : (
        <Button variant="secondary" size="sm" className="self-start" disabled={join.isPending} onClick={() => join.mutate()}>
          <MonitorSmartphone /> Join a computer
        </Button>
      )}
    </section>
  )
}
