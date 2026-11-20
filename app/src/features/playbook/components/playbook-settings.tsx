import { useEffect, useMemo, useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { ink, look } from '@/components/ui/intents'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import type { PlaybookPart } from '@/lib/api/types'
import { ago } from '@/lib/time'
import { useSessionEntries } from '@/features/sessions/hooks/use-session-entries'
import { projectGroupOf } from '@/features/sessions/model/facets'
import { usePlaybook, usePlaybookVersions, useRevertPlaybook, useSavePlaybook } from '../api/use-playbook'
import { effective, projectOf, render, scopeOf, SHARED } from '../model/playbook'

const NONE = (scope: string): PlaybookPart => ({ scope, mode: 'add', version: 0, text: '' })

/**
 * The owner's team playbook, in the hub's settings: the shared one (Everyone), or a project's, which adds to
 * it or replaces it. Saved as a new version (refused when another was saved meanwhile); the history keeps
 * every one, and a revert saves an old one again. Below, what a session of it reads at the top of my_team.
 * Sessions read it; nothing here tells the running ones.
 */
export function PlaybookSettings({ daemonId, project: asked }: { daemonId: string; project?: string }) {
  const playbook = usePlaybook(daemonId)
  const { entries } = useSessionEntries()
  const [project, setProject] = useState<string | null>(asked ?? null)
  const data = playbook.data
  const projects = useMemo(() => {
    const known = new Set(entries.map((e) => projectGroupOf(e.session)).filter((p): p is string => !!p))
    for (const p of data?.projects ?? []) known.add(projectOf(p.scope)!)
    return [...known].sort((a, b) => a.localeCompare(b))
  }, [entries, data])
  if (playbook.error) return <Banner tone="error">{playbook.error.message}</Banner>
  if (!data) return null
  const scope = scopeOf(project)
  const own = project ? (data.projects.find((p) => p.scope === scope) ?? NONE(scope)) : null
  return (
    <section aria-label="Team playbook" className="flex flex-col gap-3">
      <h2 className={ink.eyebrow}>Team playbook</h2>
      <p className={ink.hint}>
        How your agent teams work together, in your words. Every session reads it at the top of my_team; agents cannot change it. Kept on
        the hub, for every machine.
      </p>
      <Segmented
        aria-label="Which playbook"
        value={project === null ? 'all' : 'project'}
        options={[
          { value: 'all', label: 'Everyone' },
          { value: 'project', label: 'A project' },
        ]}
        onChange={(v) => setProject(v === 'all' ? null : (project ?? projects[0] ?? ''))}
      />
      {project !== null ? (
        <Select aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)}>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
              {data.projects.some((x) => x.scope === scopeOf(p)) ? ' (has its own)' : ''}
            </option>
          ))}
        </Select>
      ) : null}
      <Editor key={`${scope}:${(own ?? data.shared).version}`} daemonId={daemonId} part={own ?? data.shared} shared={data.shared} />
      <History daemonId={daemonId} scope={scope} current={(own ?? data.shared).version} />
    </section>
  )
}

function Editor({ daemonId, part, shared }: { daemonId: string; part: PlaybookPart; shared: PlaybookPart }) {
  const save = useSavePlaybook(daemonId)
  const [text, setText] = useState(part.text)
  const [mode, setMode] = useState<'add' | 'replace'>(part.mode)
  useEffect(() => save.reset(), [part.scope]) // eslint-disable-line react-hooks/exhaustive-deps
  const project = projectOf(part.scope)
  const changed = text !== part.text || mode !== part.mode
  const draft = { ...part, text, mode, version: changed ? part.version + 1 : part.version }
  const seen = render(project ? effective(shared, draft) : effective(draft, null))
  return (
    <div className="flex flex-col gap-2">
      {project ? (
        <Segmented
          aria-label="With the shared playbook"
          value={mode}
          options={[
            { value: 'add', label: 'Adds to it' },
            { value: 'replace', label: 'Replaces it' },
          ]}
          onChange={setMode}
        />
      ) : null}
      <Textarea
        code
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={project ? `${project}'s playbook` : 'Shared playbook'}
        placeholder={project ? `What sessions of ${project} do besides, or instead` : 'How your agent teams work, one habit a line'}
      />
      <p className={ink.meta}>
        {text.length} characters · {part.version ? `version ${part.version}` : 'never saved'}
        {part.at ? ` · saved ${ago(part.at)} ago` : ''} · Markdown
      </p>
      {save.error ? <Banner tone="error">{save.error.message}</Banner> : null}
      <div className="flex gap-2 self-end">
        <Button variant="ghost" disabled={!changed} onClick={() => (setText(part.text), setMode(part.mode))}>
          Discard
        </Button>
        <Button
          disabled={!changed || save.isPending}
          onClick={() => save.mutate({ scope: part.scope, text, mode: project ? mode : 'add', base: part.version })}
        >
          Save
        </Button>
      </div>
      <h3 className={ink.eyebrow}>What a session sees{project ? ` in ${project}` : ''}</h3>
      <pre className={`${look.output} p-2 whitespace-pre-wrap`}>
        {seen || 'Nothing: no playbook yet, so my_team says nothing about one.'}
      </pre>
    </div>
  )
}

function History({ daemonId, scope, current }: { daemonId: string; scope: string; current: number }) {
  const versions = usePlaybookVersions(daemonId, scope)
  const revert = useRevertPlaybook(daemonId)
  const list = versions.data ?? []
  if (!list.length) return null
  return (
    <div className="flex flex-col gap-1">
      <h3 className={ink.eyebrow}>History{scope === SHARED ? '' : ` · ${projectOf(scope)}`}</h3>
      {revert.error ? <Banner tone="error">{revert.error.message}</Banner> : null}
      <ul className={`${look.rows} flex flex-col`}>
        {list.map((v) => (
          <li key={v.version} className="flex items-center gap-2 py-1.5">
            <span className={`${ink.count} ${ink.meta}`}>v{v.version}</span>
            <span className={`${ink.body} min-w-0 flex-1 truncate`} title={v.text}>
              {v.note ?? (v.text.trim().split('\n')[0] || '(empty)')}
            </span>
            <span className={`${ink.meta} shrink-0`}>
              {v.at ? `${ago(v.at)} ago` : ''} · {v.author}
            </span>
            {v.version === current ? (
              <span className={`${ink.meta} shrink-0 px-2`}>Current</span>
            ) : (
              <Button variant="ghost" size="sm" disabled={revert.isPending} onClick={() => revert.mutate({ scope, version: v.version })}>
                Revert
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
