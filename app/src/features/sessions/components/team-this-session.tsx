import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { ink } from '@/components/ui/intents'
import { Label } from '@/components/ui/label'
import { ProjectIcon } from '@/components/ui/project-hue'
import { SuggestInput } from '@/components/ui/suggest-input'
import type { Session, UpdateTeam } from '@/lib/api/types'
import { useProjectColours } from '../api/use-project-colours'
import type { useUpdateTeam } from '../api/use-team'
import { useSessionEntries } from '../hooks/use-session-entries'
import { roleNameOf } from '../model/facets'

type Update = ReturnType<typeof useUpdateTeam>

const count = (n: number) => `${n} session${n === 1 ? '' : 's'}`

/** The values sessions have (roles, projects), most used first, each with how many have it. */
function tally(values: (string | null | undefined)[]) {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, n]) => ({ value, hint: count(n) }))
}

/** What was saved last, said quietly beside the section's title: nothing, saving, saved, or why it failed. */
export function SaveState({ update }: { update: Update }) {
  if (update.isPending) return <span className={ink.meta}>Saving…</span>
  if (update.isError) return <span className={ink.noteDanger}>Not saved: {update.error.message}</span>
  if (update.isSuccess) return <span className={ink.meta}>Saved</span>
  return null
}

const onEnter = (commit: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key !== 'Enter') return
  e.preventDefault()
  commit()
}

/** A field's text and the value last sent for it: `commit` sends the text (trimmed) when it differs. Not
 *  saved, it is sent again on the next commit; `revert` also puts the saved value back in the field. */
function useSavedField(saved: string, send: (value: string, onError: () => void) => void, revert = false) {
  const [text, setText] = useState(saved)
  const sent = useRef(saved)
  const commit = (value = text) => {
    const v = value.trim()
    if (v === sent.current) return
    const before = sent.current
    sent.current = v
    send(v, () => {
      sent.current = before
      if (revert) setText(before)
    })
  }
  return { text, setText, sent, commit }
}

/**
 * This session's place in its team: its role and its project side by side (one under the other on a phone,
 * so a long role shows whole), a one-line note under them.
 *
 * Role and note save when left (blur) or on Enter, only when changed. The project saves only when one is
 * picked from the list or on Enter, never on blur: leaving it otherwise puts back the project it has, so a
 * half-typed name never moves the session. A name no session has yet is marked "new project" first.
 */
export function ThisSession({ session, update }: { session: Session; update: Update }) {
  const { entries } = useSessionEntries()
  const hues = useProjectColours()
  const send = (patch: Omit<UpdateTeam, 'rename_project'>, onError: () => void) =>
    update.mutate({ rename_project: false, ...patch }, { onError })
  const role = useSavedField(session.team_role ?? '', (v, onError) => send({ role: v }, onError))
  const note = useSavedField(session.team_note ?? '', (v, onError) => send({ note: v }, onError))
  // Sent only when changed: a project muxtower worked out stays its own (and moves with git) until set.
  const project = useSavedField(session.project ?? '', (v, onError) => send({ project: v }, onError), true)

  const sessions = useMemo(() => entries.map((e) => e.session), [entries])
  const roles = useMemo(() => tally(sessions.map(roleNameOf)), [sessions])
  const projects = useMemo(
    () =>
      tally(sessions.map((s) => s.project)).map((p) => ({ ...p, icon: <ProjectIcon hue={hues[p.value] ?? null} className="size-4" /> })),
    [sessions, hues],
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Label>
          Role
          <SuggestInput
            floating
            placeholder="worker"
            value={role.text}
            onValueChange={role.setText}
            onPick={role.commit}
            maxLength={200}
            suggestions={roles}
            onBlur={() => role.commit()}
            onKeyDown={onEnter(role.commit)}
          />
        </Label>
        <Label>
          Project
          <SuggestInput
            floating
            fresh="new project"
            placeholder="Pick a project"
            value={project.text}
            onValueChange={project.setText}
            onPick={project.commit}
            maxLength={120}
            suggestions={projects}
            onBlur={() => project.setText(project.sent.current)}
            onKeyDown={onEnter(() => (project.text.trim() ? project.commit() : project.setText(project.sent.current)))} // none: put back
          />
        </Label>
      </div>
      <Input
        aria-label="Note"
        placeholder="Add a note (optional)"
        value={note.text}
        onChange={(e) => note.setText(e.target.value)}
        onBlur={() => note.commit()}
        onKeyDown={onEnter(note.commit)}
        maxLength={300}
      />
    </div>
  )
}
