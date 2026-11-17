import { useMatch, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { CommandPalette, type PaletteItem, type PaletteSection } from '@/components/ui/command-palette'
import { ink, look } from '@/components/ui/intents'
import { StatusIcon } from '@/components/ui/status-icon'
import { useSessionEntries } from '@/features/sessions/hooks/use-session-entries'
import { SessionActions, type SessionAction } from '@/features/sessions/components/session-actions'
import { deviceOf, entryKey, isAssistant, placeGroupOf, roleNameOf, type SessionEntry } from '@/features/sessions/model/facets'
import { presetForSession } from '@/features/sessions/model/new-here'
import { useNewSessionRequest, useSessionViews } from '@/features/sessions/store'
import { toggleLive } from '@/features/voice/live/engine'
import { useLayoutPrefs } from '@/lib/layout-prefs'
import { usePairedDaemons } from '@/lib/daemons/store'
import { useNodeNames } from '@/lib/daemons/use-nodes'
import { ago } from '@/lib/time'
import type { Session } from '@/lib/api/types'
import { matchCommands, paletteSessions, type Command } from '../model/palette'
import { useTextSearch, type SearchHit } from '../api/use-text-search'
import { useJump } from '@/features/conversation/jump'
import { usePalette, useRecentSessions } from '../store'

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const PALETTE_KEYS = MAC ? '⌘+K' : 'Ctrl+K'

const editable = (el: Element | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

/** Cmd+K (Ctrl+K off a Mac) anywhere opens the palette, or closes it; "/" too, outside a text field and a
 *  dialog. Cmd+F stays the browser's find. */
export function paletteKey(e: KeyboardEvent): boolean {
  const k = e.code === 'KeyK' && (MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.shiftKey && !e.altKey
  const slash =
    e.key === '/' &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !editable(document.activeElement) &&
    !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')
  return k || slash
}

/** The command palette over every page: sessions of every daemon by what they are called and where, and
 *  commands, some on the session in front. Its commands on that session are the session's own actions
 *  (`SessionActions`), so they open the same dialogs. */
export function PaletteHost() {
  const page = useMatch({ from: '/_sessions/d/$daemonId/s/$sessionId', shouldThrow: false })
  const { entries } = useSessionEntries()
  const current = page ? entries.find((e) => e.key === entryKey(page.params.daemonId, page.params.sessionId)) : undefined
  const note = useRecentSessions((s) => s.note)
  useEffect(() => {
    if (current) note(current.key)
  }, [current?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!paletteKey(e)) return
      e.preventDefault()
      const { open, setOpen } = usePalette.getState()
      setOpen(!open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!current) return <Palette entries={entries} />
  return (
    <SessionActions daemonId={current.daemon.id} session={current.session} open>
      {(actions) => <Palette entries={entries} current={current} actions={actions} />}
    </SessionActions>
  )
}

function Palette({ entries, current, actions = [] }: { entries: SessionEntry[]; current?: SessionEntry; actions?: SessionAction[] }) {
  const { open, query, setOpen, setQuery } = usePalette()
  const recent = useRecentSessions((s) => s.keys)
  const navigate = useNavigate()
  const startNew = useNewSessionRequest((s) => s.start)
  const toggleFocus = useLayoutPrefs((s) => s.toggleFocus)
  const setView = useSessionViews((s) => s.setView)
  const chosenView = useSessionViews((s) => (current ? (s.views[current.key] ?? s.last) : undefined))
  const hub = usePairedDaemons()[0]
  const nodes = useNodeNames(current?.daemon.id ?? '')
  const sessions = useMemo(() => (open ? paletteSessions(entries, query, recent) : []), [open, entries, query, recent])
  const text = useTextSearch(query, open)
  const jump = useJump((s) => s.go)
  const byKey = useMemo(() => new Map(entries.map((e) => [e.key, e])), [entries])

  const commands: Command[] = []
  commands.push({ id: 'new', label: 'New session…', run: () => startNew({ daemonId: '', node: null, cwd: '' }) })
  if (current) {
    const here = presetForSession(current.daemon.id, current.session, nodes)
    if (here) commands.push({ id: 'new-here', label: 'New session here', run: () => startNew(here) })
    commands.push({ id: 'live', label: 'Toggle Live', keys: 'Alt+L', run: () => void toggleLive() })
  }
  commands.push({ id: 'focus', label: 'Focus mode', keys: 'Alt+F', run: toggleFocus })
  const action = (id: SessionAction['id'], label: (a: SessionAction) => string) => {
    const a = actions.find((x) => x.id === id && !x.disabled)
    if (a) commands.push({ id, label: label(a), run: a.run })
  }
  action('read', (a) => (a.label === 'Read' ? 'Mark read' : 'Mark unread'))
  action('archive', () => 'Archive this session')
  action('resume', (a) => `${a.label} this session`)
  action('team', () => 'Open Team')
  if (current) {
    const { screen, conversation } = current.session.capabilities
    if (screen && conversation) {
      const to = chosenView === 'conversation' ? 'terminal' : 'conversation'
      commands.push({ id: 'view', label: `Switch to the ${to}`, run: () => setView(current.key, to) })
    }
  }
  const settingsOf = current?.daemon.id ?? hub?.id
  if (settingsOf)
    commands.push({
      id: 'settings',
      label: 'Open Settings',
      run: () => void navigate({ to: '/daemons/$daemonId/settings', params: { daemonId: settingsOf } }),
    })

  const openSession = (e: SessionEntry) =>
    void navigate({ to: '/d/$daemonId/s/$sessionId', params: { daemonId: e.daemon.id, sessionId: e.session.id }, search: true })
  const sections: PaletteSection[] = [
    {
      id: 'sessions',
      label: query.trim() ? 'Sessions' : 'Recent and waiting',
      items: sessions.map((e): PaletteItem => ({
        id: e.key,
        label: e.session.name,
        children: <SessionItem session={e.session} />,
        onSelect: () => openSession(e),
      })),
    },
    {
      id: 'text',
      label: 'In conversations',
      note: text.searching.length
        ? `searching${text.searching
            .filter((n) => n !== '…')
            .map((n) => ` ${n}`)
            .join(',')}…`
        : text.pending
          ? 'searching…'
          : undefined,
      items: text.hits.map((hit): PaletteItem => {
        const key = entryKey(text.hubId ?? '', hit.session_id)
        const entry = byKey.get(key)
        const said = hit.snippet.map((p) => p.text).join('')
        return {
          id: `hit:${hit.session_id}:${hit.seq}`,
          label: `${entry?.session.name ?? hit.session_id}: ${said}`,
          children: <HitItem hit={hit} name={entry?.session.name ?? hit.session_id} />,
          onSelect: () => {
            jump(key, hit.seq)
            void navigate({
              to: '/d/$daemonId/s/$sessionId',
              params: { daemonId: text.hubId ?? '', sessionId: hit.session_id },
              search: true,
            })
          },
        }
      }),
    },
    {
      id: 'commands',
      label: 'Commands',
      items: matchCommands(commands, query).map((c) => ({ id: `cmd:${c.id}`, label: c.label, keys: c.keys, onSelect: c.run })),
    },
  ]
  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      query={query}
      onQueryChange={setQuery}
      sections={sections}
      label="Go to a session or a command"
      placeholder="Sessions, role:pm, project:…, or a command"
      empty="Nothing matches."
    />
  )
}

/** A place in a conversation that matched: who said it, in which session, when, and the words around the
 *  match, the match marked. */
function HitItem({ hit, name }: { hit: SearchHit; name: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        <span className={`${look.tag} shrink-0`}>{hit.role === 'user' ? 'You' : 'Agent'}</span>
        <span className={`${ink.strong} min-w-0 flex-1 truncate`}>{name}</span>
        {hit.archived ? <span className={`${look.tag} shrink-0`}>Archived</span> : null}
        {hit.at ? <span className={`${ink.meta} ${ink.count} shrink-0`}>{ago(hit.at)}</span> : null}
      </div>
      <div className={`${ink.meta} line-clamp-2`}>
        {hit.snippet.map((part, i) =>
          part.match ? (
            <mark key={i} className={ink.highlight}>
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </div>
    </div>
  )
}

/** A session as the list shows it, in one line and a half: its state, name, time; role · project, device. */
function SessionItem({ session }: { session: Session }) {
  const where = [roleNameOf(session), placeGroupOf(session).name].filter(Boolean).join(' · ')
  return (
    <div className="flex min-w-0 items-start gap-2">
      <StatusIcon state={session.state} assistant={isAssistant(session)} unread={session.unread} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`${session.unread || session.needs_attention ? ink.emphasis : ink.strong} min-w-0 flex-1 truncate`}>
            {session.name}
          </span>
          {session.archived_at ? <span className={`${look.tag} shrink-0`}>Archived</span> : null}
          <span className={`${look.tag} shrink-0`}>{deviceOf(session) ?? '—'}</span>
          <span className={`${ink.meta} ${ink.count} shrink-0`}>{ago(session.updated_at)}</span>
        </div>
        {where ? <div className={`${ink.meta} truncate`}>{where}</div> : null}
      </div>
    </div>
  )
}
