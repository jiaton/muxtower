import { draftKey, useDrafts } from './store'

/**
 * A session's message box, written to from outside the page (Live mode's voice): words appended at the end
 * (or, when a quote's reply is the field in focus, at the end of that reply), the box cleared, the last
 * words taken back, and what it holds sent exactly as Send does (`submitters`, which `InputBar` fills while
 * it shows). Quotes are left as they are, but for the reply in focus.
 */

interface Target {
  daemonId: string
  sessionId: string
}

/** Each shown box's Send, by its draft key: 'empty' when there is nothing to send. */
export const submitters = new Map<string, () => 'sent' | 'empty'>()

type Appended = { quote: string | null; text: string }
const appended = new Map<string, Appended[]>() // per draft key, for undo

const QUOTE_FIELD = 'textarea[data-quote]'

/** The quote whose reply is the field in focus in that box, if one is. */
function focusedQuote(key: string): string | null {
  const el = document.activeElement
  return el instanceof HTMLTextAreaElement && el.matches(QUOTE_FIELD) && el.dataset.draft === key ? (el.dataset.quote ?? null) : null
}

const joined = (before: string, text: string) => (before.trimEnd() ? `${before.trimEnd()} ${text}` : text)

function withoutEnd(value: string, text: string): string {
  const trimmed = value.trimEnd()
  if (trimmed.endsWith(text)) return trimmed.slice(0, trimmed.length - text.length).trimEnd()
  const at = trimmed.lastIndexOf(text) // edited since: its last occurrence
  return at < 0 ? value : `${trimmed.slice(0, at).trimEnd()} ${trimmed.slice(at + text.length).trimStart()}`.trim()
}

export const draftBox = {
  append(target: Target, text: string) {
    const key = draftKey(target.daemonId, target.sessionId)
    const state = useDrafts.getState()
    const quote = focusedQuote(key)
    if (quote !== null) {
      const quotes = state.quotes[key] ?? []
      state.setQuotes(
        key,
        quotes.map((q) => (q.text === quote ? { ...q, reply: joined(q.reply, text) } : q)),
      )
    } else {
      state.setDraft(key, joined(state.drafts[key] ?? '', text))
    }
    appended.set(key, [...(appended.get(key) ?? []), { quote, text }])
  },

  clear(target: Target) {
    const key = draftKey(target.daemonId, target.sessionId)
    useDrafts.getState().setDraft(key, '')
    appended.set(
      key,
      (appended.get(key) ?? []).filter((a) => a.quote !== null),
    )
  },

  undo(target: Target): boolean {
    const key = draftKey(target.daemonId, target.sessionId)
    const last = appended.get(key)?.at(-1)
    if (!last) return false
    appended.set(key, appended.get(key)!.slice(0, -1))
    const state = useDrafts.getState()
    if (last.quote === null) state.setDraft(key, withoutEnd(state.drafts[key] ?? '', last.text))
    else {
      const quotes = state.quotes[key] ?? []
      state.setQuotes(
        key,
        quotes.map((q) => (q.text === last.quote ? { ...q, reply: withoutEnd(q.reply, last.text) } : q)),
      )
    }
    return true
  },

  send(target: Target): 'sent' | 'empty' {
    const key = draftKey(target.daemonId, target.sessionId)
    const submit = submitters.get(key)
    if (!submit) return 'empty' // its page is not shown: nothing sends from elsewhere
    const result = submit()
    if (result === 'sent') appended.delete(key)
    return result
  },
}
