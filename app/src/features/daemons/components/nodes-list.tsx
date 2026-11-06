import { Link } from '@tanstack/react-router'
import { Check, Copy, MonitorSmartphone, MoreHorizontal, Settings2, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { StatusDot } from '@/components/ui/status-dot'
import { useNodes } from '@/lib/daemons/use-nodes'
import { useDaemonSessions } from '@/features/sessions/api/use-sessions'
import { useDaemonMe } from '../api/use-daemon-me'
import { useJoinCode, useRemoveNode } from '../api/use-nodes'
import { NodeAddress } from './node-address'

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : 'never')
const count = (n: number) => `${n} session${n === 1 ? '' : 's'}`

/** One machine, the daemon itself or a computer joined to it, as equals: its state and what it runs on
 *  the left (wrapping under on a phone), its Settings and ⋯ on the right. `below`: under the row. */
function MachineRow({
  name,
  tag,
  online,
  facts,
  folder,
  settings,
  menu,
  below,
}: {
  name: string
  tag?: string
  online: boolean
  facts: (string | null | undefined)[]
  folder?: string | null
  settings: ReactNode
  menu?: ReactNode
  below?: ReactNode
}) {
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-40 flex-1 items-start gap-2.5">
          <span className="pt-1.5">
            <StatusDot tone={online ? 'ok' : 'idle'} label={online ? 'Online' : 'Offline'} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{name}</span>
              {tag ? <Badge>{tag}</Badge> : null}
            </span>
            <span className="text-xs break-words text-fg-muted">{facts.filter(Boolean).join(' · ')}</span>
            {folder ? (
              <span className="text-xs break-all text-fg-muted">
                New sessions in <span className="font-mono">{folder}</span>
              </span>
            ) : null}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {settings}
          {menu}
        </div>
      </div>
      {below ? <div className="flex flex-col gap-1 pl-5">{below}</div> : null}
    </li>
  )
}

function SettingsLink({ daemonId, node, name }: { daemonId: string; node?: string; name: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/daemons/$daemonId/settings" params={{ daemonId }} search={node ? { node } : {}} aria-label={`Settings of ${name}`}>
        <Settings2 /> Settings
      </Link>
    </Button>
  )
}

/** The machines this daemon drives: itself, and the other computers joined to it (its nodes), whose
 *  sessions are listed and driven through it, so this device needs no address of theirs. Joining one
 *  is a command on that computer, with a code made here; removing one (in its ⋯, confirmed) drops its
 *  sessions. */
export function MachinesList({ daemonId, url }: { daemonId: string; url: string }) {
  const me = useDaemonMe(daemonId).data
  const own = (useDaemonSessions(daemonId).data ?? []).filter((s) => !s.node).length
  const nodes = useNodes(daemonId)
  const remove = useRemoveNode(daemonId)
  const join = useJoinCode(daemonId)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const command = join.data ? `muxtower pair --join ${url} --code ${join.data.code}` : null
  const list = nodes.data ?? []
  const hub = me?.daemon_name ?? 'this daemon'

  return (
    <section aria-labelledby={`machines-${daemonId}`} className="flex flex-col gap-2">
      <h3 id={`machines-${daemonId}`} className="text-sm font-medium">
        Machines
      </h3>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        <MachineRow
          name={hub}
          tag="this daemon"
          online
          facts={[me?.version ? `v${me.version}` : null, count(own)]}
          folder={me?.default_folder}
          settings={<SettingsLink daemonId={daemonId} name={hub} />}
        />
        {list.map((n) => (
          <MachineRow
            key={n.name}
            name={n.name}
            online={n.online}
            facts={[n.online ? null : `offline since ${when(n.last_seen)}`, n.version ? `v${n.version}` : null, count(n.sessions)]}
            folder={n.default_folder}
            settings={n.online ? <SettingsLink daemonId={daemonId} node={n.name} name={n.name} /> : null}
            menu={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`More for ${n.name}`} title="More">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem tone="danger" onSelect={() => setConfirm(n.name)}>
                    <Trash2 /> Remove {n.name}…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
            below={
              <>
                <NodeAddress daemonId={daemonId} node={n} />
                {n.update ? (
                  <span className="text-xs text-state-permission">
                    Runs {n.version}; update it to {n.update}:{' '}
                    <code className="font-mono break-all">pipx install --force muxtower=={n.update}</code>
                  </span>
                ) : null}
                {confirm === n.name ? (
                  <div role="alertdialog" aria-label={`Remove ${n.name}?`} className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="basis-full text-xs text-fg-muted">
                      Remove {n.name}? Its sessions leave the lists, and it can only join again with a new code.
                    </span>
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setConfirm(null)}>
                      Cancel
                    </Button>
                    <Button variant="danger" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(n.name)}>
                      Remove {n.name}
                    </Button>
                  </div>
                ) : null}
              </>
            }
          />
        ))}
      </ul>
      {list.length ? null : (
        <p className="text-sm text-fg-muted">Another computer running muxtower can join this one, and its sessions show here too.</p>
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
            The code works once, until {new Date(join.data!.expires_at).toLocaleTimeString()}. If a sign-in gate is in front of this daemon,
            give that computer its token first: <code className="font-mono">[hub] headers</code> in its config.
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
