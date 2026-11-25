import { useNavigate } from '@tanstack/react-router'
import {
  Archive,
  Eye,
  EyeOff,
  FolderInput,
  Mail,
  MailOpen,
  OctagonX,
  Pencil,
  Pin,
  PinOff,
  SquarePlus,
  SquareTerminal,
  RotateCcw,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Session } from '@/lib/api/types'
import { MENU_KEYS } from '@/lib/shortcuts'
import { useHideSession, useMarkRead, usePinSession } from '../api/use-session-marks'
import { useRecoverSessions } from '../api/use-recovery'
import { presetForSession } from '../model/new-here'
import { useNodeNames } from '@/lib/daemons/use-nodes'
import { useSendInput } from '@/features/terminal/api/use-terminal'
import { useNewSessionRequest } from '../store'
import { ContinueDialog } from './continue-dialog'
import { PlaceDialog } from './place-dialog'
import { RenameDialog } from './rename-dialog'
import { ResumeDialog } from './resume-dialog'
import { ArchiveDialog, DeleteDialog, HideInsteadDialog } from './session-dialogs'
import { TeamDialog } from './team-dialog'

export interface SessionAction {
  id: 'read' | 'pin' | 'new' | 'rename' | 'place' | 'team' | 'continue' | 'hide' | 'archive' | 'interrupt' | 'delete' | 'resume'
  label: string
  icon: LucideIcon
  tone?: 'accent' | 'neutral' | 'danger'
  run: () => void
  /** Only in menus: a list row's swipe tray has room for the rest. */
  menuOnly?: boolean
  /** Shown, not offered: why it cannot be done (a menu item, greyed, says so; a swipe tray leaves it out). */
  disabled?: string
}

/** The key that does an action while a menu of them is open (`DropdownMenuItem shortcut`): mnemonic, one
 *  each. */
export const ACTION_KEYS: Partial<Record<SessionAction['id'], string>> = MENU_KEYS // the registry's

/** What the owner can do to a session from anywhere it is shown (a list row's swipe tray or menu, the
 *  session's own menu): mark read or unread, pin or unpin, rename, move (say where it runs), continue in a terminal
 *  (a session only in the Claude app), hide or show, interrupt,
 *  archive (the one way to end it: the agent ends, its history is kept); rename, move and archive only where
 *  its capabilities allow. An archived session can only be deleted from the archive;
 *  one a restart interrupted can be started again or archived. Renders
 *  `children(actions)` plus the dialogs they open (archive and delete ask first). `open`: the session
 *  is the page being shown, so marking it unread, hiding or deleting it goes back to the list first (an
 *  open session is read, and a hidden one has no place beside the list); an archived one stays, read-only. */
export function SessionActions({
  daemonId,
  session,
  open = false,
  children,
}: {
  daemonId: string
  session: Session
  open?: boolean
  children: (actions: SessionAction[]) => ReactNode
}) {
  const navigate = useNavigate()
  const markRead = useMarkRead()
  const hide = useHideSession()
  const pin = usePinSession()
  const recover = useRecoverSessions(daemonId)
  const input = useSendInput(daemonId, session.id)
  const startHere = useNewSessionRequest((s) => s.start)
  const here = presetForSession(daemonId, session, useNodeNames(daemonId)) // null: not where one can start
  const [dialog, setDialog] = useState<'rename' | 'place' | 'team' | 'continue' | 'archive' | 'delete' | 'resume' | null>(null)
  const ids = { daemonId, sessionId: session.id }
  const leaving = (then: () => void) => (open ? () => void navigate({ to: '/', search: true }).then(then) : then)

  const remove: SessionAction = { id: 'delete', label: 'Delete', icon: Trash2, tone: 'danger', run: () => setDialog('delete') }
  const archive: SessionAction = { id: 'archive', label: 'Archive', icon: Archive, tone: 'neutral', run: () => setDialog('archive') }
  // One a restart interrupted (its recovery failed): started again, or archived with its history.
  const actions: SessionAction[] = session.interrupted_at
    ? [{ id: 'resume', label: 'Start again', icon: RotateCcw, tone: 'accent', run: () => recover.mutate([session.id]) }, archive]
    : session.archived_at
      ? [...resumeArchived(), remove]
      : liveActions()

  /** An archived session started again with its conversation; when it cannot be, why (another folder can
   *  be given when its own is gone). */
  function resumeArchived(): SessionAction[] {
    const blocked = session.resume_blocked
    if (!session.capabilities.resume && !blocked) return [] // an older daemon: it cannot tell
    const open = () => setDialog('resume')
    const why = blocked && blocked.code !== 'folder' ? blocked.reason : undefined
    return [{ id: 'resume', label: 'Resume', icon: RotateCcw, tone: 'accent', run: open, disabled: why }]
  }

  function liveActions(): SessionAction[] {
    const live: SessionAction[] = [
      session.unread
        ? { id: 'read', label: 'Read', icon: MailOpen, tone: 'accent', run: () => markRead.mutate({ ...ids, read: true }) }
        : { id: 'read', label: 'Unread', icon: Mail, tone: 'accent', run: leaving(() => markRead.mutate({ ...ids, read: false })) },
      session.pinned
        ? { id: 'pin', label: 'Unpin', icon: PinOff, tone: 'neutral', run: () => pin.mutate({ ...ids, pinned: false }) }
        : { id: 'pin', label: 'Pin', icon: Pin, tone: 'neutral', run: () => pin.mutate({ ...ids, pinned: true }) },
    ]
    // Another session where this one is: its machine and folder (and its team), only typing left.
    if (here)
      live.push({
        id: 'new',
        label: 'New here',
        icon: SquarePlus,
        tone: 'neutral',
        menuOnly: true,
        run: () => here && startHere(here),
      })
    if (session.capabilities.rename)
      live.push({ id: 'rename', label: 'Rename', icon: Pencil, tone: 'neutral', run: () => setDialog('rename'), menuOnly: true })
    if (session.capabilities.place)
      live.push({ id: 'place', label: 'Move', icon: FolderInput, tone: 'neutral', run: () => setDialog('place'), menuOnly: true })
    live.push({ id: 'team', label: 'Team', icon: Users, tone: 'neutral', run: () => setDialog('team'), menuOnly: true })
    // A session only in the Claude app or on claude.ai: closed there, and resumed in a terminal on its machine.
    if (session.capabilities.continue_terminal)
      live.push({
        id: 'continue',
        label: 'Continue in terminal',
        icon: SquareTerminal,
        tone: 'neutral',
        menuOnly: true,
        run: () => setDialog('continue'),
        disabled: session.continue_blocked ?? undefined,
      })
    live.push(
      session.hidden
        ? { id: 'hide', label: 'Show', icon: Eye, tone: 'neutral', run: () => hide.mutate({ ...ids, hidden: false }) }
        : { id: 'hide', label: 'Hide', icon: EyeOff, tone: 'neutral', run: leaving(() => hide.mutate({ ...ids, hidden: true })) },
    )
    if (session.capabilities.archive) live.push(archive)
    // What it is doing now, stopped (Escape, as in its terminal); the session goes on.
    if (session.state === 'busy' && session.capabilities.screen)
      live.push({
        id: 'interrupt',
        label: 'Interrupt',
        icon: OctagonX,
        tone: 'neutral',
        menuOnly: true,
        run: () => input.mutate({ key: 'Escape' }),
      })
    return live
  }

  return (
    <>
      {children(actions)}
      {dialog === 'resume' ? <ResumeDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === 'rename' ? <RenameDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === 'place' ? <PlaceDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === 'team' ? <TeamDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === 'continue' ? <ContinueDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === 'archive' && session.capabilities.archive_ends === false ? (
        <HideInsteadDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} onDone={leaving(() => {})} />
      ) : dialog === 'archive' ? (
        <ArchiveDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} onDone={leaving(() => {})} />
      ) : null}
    </>
  )
}
