import { ArrowRight, Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDictionary, useSaveDictionary, type Dictionary } from '../api/use-dictionary'

/**
 * The voice dictionary, under "Voice input" in the hub's settings: words speech to text should know (they
 * end its prompt, first ones first, as many as fit in what it reads), and corrections of what it still
 * writes wrong, applied in order to every transcript. Kept on the hub, the same on every device. Each change
 * saves it whole.
 */
export function DictionarySettings({ daemonId }: { daemonId: string }) {
  const dictionary = useDictionary(daemonId)
  const save = useSaveDictionary(daemonId)
  const [word, setWord] = useState('')
  const [heard, setHeard] = useState('')
  const [write, setWrite] = useState('')
  const data = dictionary.data
  if (!data) return null
  const { fit } = data
  const words = data.words ?? []
  const corrections = data.corrections ?? []
  const put = (next: Partial<Dictionary>) => save.mutate({ words, corrections, ...next })
  const addWord = (e: FormEvent) => {
    e.preventDefault()
    if (word.trim()) put({ words: [...words, word.trim()] })
    setWord('')
  }
  const addCorrection = (e: FormEvent) => {
    e.preventDefault()
    if (!heard.trim()) return
    put({ corrections: [...corrections, { heard: heard.trim(), write: write.trim() }] })
    setHeard('')
    setWrite('')
  }
  const edit = (i: number, change: Partial<{ heard: string; write: string }>) =>
    put({ corrections: corrections.map((c, j) => (j === i ? { ...c, ...change } : c)) })

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border px-3 py-3" aria-label="Dictionary">
      <div>
        <h3 className="text-sm font-medium">Dictionary</h3>
        <p className="text-xs text-fg-muted">
          Words speech to text should know, and corrections of what it still writes wrong. Kept on this hub, for every device.
        </p>
      </div>
      {save.isError ? <Banner tone="error">{save.error.message}</Banner> : null}

      <section aria-label="Words" className="flex flex-col gap-2">
        <h4 className="text-xs font-medium text-fg-muted">Words</h4>
        {words.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {words.map((w) => (
              <li key={w} className="flex items-center gap-1 rounded-full bg-surface-muted py-0.5 pr-1 pl-2.5 text-sm">
                {w}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-6"
                  aria-label={`Remove ${w}`}
                  disabled={save.isPending}
                  onClick={() => put({ words: words.filter((x) => x !== w) })}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <form className="flex gap-2" onSubmit={addWord}>
          <Input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="Add a word, e.g. acme-cli"
            aria-label="New word"
            maxLength={80}
          />
          <Button type="submit" variant="secondary" disabled={!word.trim() || save.isPending}>
            <Plus /> Add
          </Button>
        </form>
        <p className={fit.words_in_prompt < fit.words ? 'text-xs text-state-permission' : 'text-xs text-fg-muted'}>
          {fit.words_in_prompt < fit.words
            ? `Only the first ${fit.words_in_prompt} of ${fit.words} words fit in what speech to text reads of its prompt; the rest are left out. Put the most important first.`
            : fit.words
              ? `All ${fit.words} words are in the prompt (${fit.tokens} of ${fit.budget} tokens).`
              : 'Words you add are given to speech to text with each recording.'}
        </p>
      </section>

      <section aria-label="Corrections" className="flex flex-col gap-2">
        <h4 className="text-xs font-medium text-fg-muted">Corrections, applied in order</h4>
        <ul className="flex flex-col gap-1.5">
          {corrections.map((c, i) => (
            <li key={`${i}:${c.heard}`} className="flex items-center gap-2">
              <Input
                defaultValue={c.heard}
                aria-label={`Heard ${i + 1}`}
                maxLength={80}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.heard && edit(i, { heard: e.target.value.trim() })}
              />
              <ArrowRight className="size-4 shrink-0 text-fg-muted" aria-hidden />
              <Input
                defaultValue={c.write}
                aria-label={`Write ${i + 1}`}
                maxLength={80}
                onBlur={(e) => e.target.value !== c.write && edit(i, { write: e.target.value.trim() })}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove the correction of ${c.heard}`}
                disabled={save.isPending}
                onClick={() => put({ corrections: corrections.filter((_, j) => j !== i) })}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
        <form className="flex items-center gap-2" onSubmit={addCorrection}>
          <Input
            value={heard}
            onChange={(e) => setHeard(e.target.value)}
            placeholder="Heard, e.g. zorbit"
            aria-label="New heard"
            maxLength={80}
          />
          <ArrowRight className="size-4 shrink-0 text-fg-muted" aria-hidden />
          <Input
            value={write}
            onChange={(e) => setWrite(e.target.value)}
            placeholder="Write, e.g. Zorbit"
            aria-label="New write"
            maxLength={80}
          />
          <Button type="submit" variant="secondary" disabled={!heard.trim() || save.isPending}>
            <Plus /> Add
          </Button>
        </form>
        <p className="text-xs text-fg-muted">
          Case aside, whole words or phrases (in Chinese or Japanese, anywhere); each part is replaced once.
        </p>
      </section>
    </div>
  )
}

/** Adding the word selected on a session's screen while Live is on: the word (spelled right on screen), and
 *  optionally what speech to text writes for it, which becomes a correction to it. */
export function DictionaryQuickAdd({ daemonId, word: selected, onClose }: { daemonId: string; word: string; onClose: () => void }) {
  const dictionary = useDictionary(daemonId)
  const save = useSaveDictionary(daemonId)
  const [word, setWord] = useState(selected.trim().slice(0, 80))
  const [heard, setHeard] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const current = dictionary.data
    if (!current || !word.trim()) return
    const kept = current.corrections ?? []
    const corrections = heard.trim() ? [...kept, { heard: heard.trim(), write: word.trim() }] : kept
    save.mutate({ words: [...(current.words ?? []), word.trim()], corrections }, { onSuccess: onClose })
  }
  return (
    <form
      aria-label="Add to dictionary"
      className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-muted px-2 py-2 text-sm"
      onSubmit={submit}
    >
      <label className="flex min-w-32 flex-1 flex-col gap-1">
        <span className="text-xs text-fg-muted">Word</span>
        <Input value={word} onChange={(e) => setWord(e.target.value)} maxLength={80} autoFocus />
      </label>
      <label className="flex min-w-32 flex-1 flex-col gap-1">
        <span className="text-xs text-fg-muted">Often heard as (optional)</span>
        <Input value={heard} onChange={(e) => setHeard(e.target.value)} maxLength={80} placeholder="what it writes instead" />
      </label>
      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={!word.trim() || !dictionary.data || save.isPending}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {save.isError ? <p className="basis-full text-xs text-danger">{save.error.message}</p> : null}
    </form>
  )
}
