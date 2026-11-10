import type { MachineSettings, SettingView } from '@/lib/api/types'

type Row = Omit<SettingView, 'source' | 'pending' | 'value'> & { value?: unknown; file?: boolean }
const row = (key: string, section: string, label: string, kind: SettingView['kind'], applies: SettingView['applies'],
  fallback: unknown, more: Partial<Row> = {}): Row => ({ key, section, label, kind, applies, default: fallback, help: '', choices: [], ...more }) // prettier-ignore

/** A daemon's feature settings, as `GET /v1/settings` lists them (one set by its config file). */
const ROWS: Row[] = [
  row('recovery.mode', 'After a restart', 'Interrupted sessions', 'choice', 'now', 'ask', {
    choices: ['ask', 'auto', 'off'],
    help: 'ask: listed to start again; auto: started again at once; off: let go',
  }),
  row('concierge.enabled', 'Concierge', 'Concierge', 'bool', 'restart', false, { help: 'a session that watches the others for you' }),
  row('concierge.model', 'Concierge', 'Model', 'text', 'restart', 'sonnet', { help: 'e.g. sonnet or opus' }),
  row('summaries.provider', 'Summaries', 'Summarize replies with', 'choice', 'restart', 'off', {
    choices: ['off', 'claude-code', 'codex'],
    value: 'claude-code',
    file: true,
  }),
  row('summaries.min_chars', 'Summaries', 'Summarize replies longer than (characters)', 'number', 'restart', 400),
  row('asr.provider', 'Voice input', 'Speech recognition', 'choice', 'restart', 'off', {
    choices: ['off', 'groq', 'openai'],
    value: 'groq',
    file: true,
    help: 'its API key is set in the config file',
  }),
  row('asr.language', 'Voice input', 'Language', 'text', 'restart', '', { help: 'e.g. zh; empty: detected per recording' }),
  row('usage.cpu_percent', 'Usage alerts', 'CPU above (% of one core, 1 min)', 'number', 'now', 20),
  row('usage.rss_mb', 'Usage alerts', 'Memory above (MB)', 'number', 'now', 500),
]

/** What the demo daemon keeps: changes from the page, over the defaults; the file's stay. */
export class DemoSettings {
  private readonly changed = new Map<string, unknown>()

  list(machine: string): MachineSettings {
    const settings = ROWS.map(({ file, value, ...r }): SettingView => {
      const mine = this.changed.has(r.key)
      const now = file ? value : mine ? this.changed.get(r.key) : r.default
      return { ...r, value: now, source: file ? 'config_file' : mine ? 'app' : 'default', pending: r.applies === 'restart' && mine }
    })
    return { machine, settings }
  }

  change(values: Record<string, unknown>): string | null {
    for (const key of Object.keys(values)) {
      const r = ROWS.find((x) => x.key === key)
      if (!r) return `${key} is not a setting the app changes`
      if (r.file) return `${key} is set in the config file; change it there`
    }
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === '') this.changed.delete(key)
      else this.changed.set(key, value)
    }
    return null
  }
}
