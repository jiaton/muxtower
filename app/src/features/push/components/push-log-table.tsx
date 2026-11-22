import { ink, look } from '@/components/ui/intents'
import type { PushLogRecord } from '@/lib/push-log'
import { usePushLog } from '../api/use-push-log'

const SHOWN = 40 // the newest; the daemon has them all (`push-clear` diagnostics)

/** A tag as `<first 4 of the daemon id>:<session>`: short, and a daemon id that changed still shows. */
const short = (tag: string) => {
  const at = tag.indexOf(':')
  return at < 0 ? tag : `${tag.slice(0, 4)}:${tag.slice(at + 1)}`
}
const list = (tags: string[]) => (tags.length ? tags.map(short).join(' ') : '–')
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour12: false })
const event = (r: PushLogRecord) => (r.event === 'show' && r.kind ? `show ${r.kind}` : r.event)

/** What this device's service worker did with pushes and notifications lately (`lib/push-log.ts`): what it
 *  showed, what a push asked it to close, what was on screen then, what it closed and what it held back to
 *  leave one. Ids and times only. Nothing while it has none. */
export function PushLogTable() {
  const { data } = usePushLog()
  const rows = (data ?? []).slice(-SHOWN).reverse()
  if (!rows.length) return null
  return (
    <div className="flex flex-col gap-1">
      <h3 className={ink.quiet}>Notifications on this device</h3>
      <div className="overflow-x-auto">
        <table className={look.logTable} aria-label="Notifications shown and closed on this device">
          <thead>
            <tr>
              {['Time', 'Event', 'Tag', 'Asked to close', 'Shown before', 'Closed', 'Held back'].map((h) => (
                <th key={h} scope="col" className={`${ink.meta} pr-2 whitespace-nowrap`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, record: r }) => (
              <tr key={key} className="align-top">
                <td className="pr-2 whitespace-nowrap">{time(r.at)}</td>
                <td className="pr-2 whitespace-nowrap">{event(r)}</td>
                <td className="pr-2 whitespace-nowrap">{r.tag ? short(r.tag) : '–'}</td>
                <td className="pr-2">{list(r.asked)}</td>
                <td className="pr-2">{r.event === 'show' || r.event === 'clear' ? `${r.present.length}: ${list(r.present.map((n) => n.tag))}` : '–'}</td>
                <td className="pr-2">{list(r.closed)}</td>
                <td className="pr-2">{list(r.held)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
