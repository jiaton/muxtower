import type { Session } from '@/hub/types'
import { initialNav, type AppState } from '@/state/model'

export const NOW = Date.parse('2026-10-18T12:00:00Z')

export function session(id: string, over: Partial<Session> = {}): Session {
  return {
    id,
    name: id,
    runtime: 'claude-code',
    cwd: '',
    source: 'remote_control',
    machine: 'box',
    capabilities: { screen: false, conversation: true, keys: ['Escape'], resize: false, terminate: false, rename: false },
    state: 'idle',
    state_source: 'remote',
    matched_rule: null,
    needs_attention: false,
    pending: null,
    last_message: null,
    auto_approve: false,
    can_auto_approve: false,
    created_at: '2026-10-18T10:00:00Z',
    updated_at: '2026-10-18T11:50:00Z',
    ...over,
  } as Session
}

export const waiting = (id: string, updated: string, over: Partial<Session> = {}) =>
  session(id, {
    state: 'needs_permission',
    needs_attention: true,
    updated_at: updated,
    pending: {
      state: 'needs_permission',
      tool_name: 'Bash',
      detail: 'npm run db:migrate',
      options: [
        { key: 'allow', label: 'Yes' },
        { key: 'deny', label: 'No' },
      ],
      recommended: 'allow',
    },
    ...over,
  } as Partial<Session>)

export const appState = (sessions: Session[], over: Partial<AppState> = {}): AppState => ({
  link: 'open',
  hubName: 'hub',
  sessions,
  loaded: true,
  nav: initialNav(),
  notice: null,
  voice: null,
  features: { summaries: true, asr: true },
  diag: null,
  ...over,
})
