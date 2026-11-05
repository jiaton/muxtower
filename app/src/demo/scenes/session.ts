import type { ConversationItem, Session } from '@/lib/api/types'

/** The simulated daemon: a hub ("build-box") with one more computer joined to it. */
export const DEMO_DAEMON = { id: 'demo', name: 'build-box', url: 'https://daemon.demo.invalid', token: 'demo' }
export const NODE = 'laptop'
export const HOME = '/home/dev'

const started = Date.now()
/** A time `minutes` before the demo was opened. */
export const ago = (minutes: number) => new Date(started - minutes * 60_000).toISOString()

/** A session as the daemon lists it: a Claude Code agent muxtower started in tmux, unless told otherwise. */
export function demoSession(fields: Pick<Session, 'id' | 'name' | 'cwd'> & Partial<Session>): Session {
  return {
    runtime: 'claude-code',
    source: 'launched',
    machine: DEMO_DAEMON.name,
    origin: null,
    tmux_socket: 'muxtower',
    tmux_session: `mxt-${fields.id}`,
    tmux_pane: '%1',
    capabilities: {
      screen: true,
      conversation: true,
      keys: [],
      resize: true,
      terminate: true,
      rename: true,
      archive: true, archive_ends: true,
      place: false,
      images: true,
    },
    alt_screen: false,
    terminal_attached: false,
    role: null,
    remote_id: null,
    summary: null,
    reply_summary: null,
    unread: false,
    finished_at: null,
    hidden: false,
    pinned: false,
    notify: 'all',
    placement: null,
    archived_at: null,
    project_auto: false,
    node: null,
    fork_of: null,
    side_chat: false,
    on_host: true,
    offline: false,
    account: null,
    state: 'idle',
    state_source: 'hook',
    matched_rule: null,
    needs_attention: false,
    pending: null,
    last_message: null,
    auto_approve: false,
    can_auto_approve: true,
    created_at: ago(95),
    updated_at: ago(2),
    ...fields,
  }
}

type ItemFields = Omit<ConversationItem, 'seq' | 'kind' | 'actions' | 'images'> & Partial<ConversationItem>
const item = (kind: ConversationItem['kind']) => (seq: number, fields: ItemFields) =>
  ({ seq, kind, actions: [], images: [], ...fields }) as ConversationItem

export const prompt = item('prompt')
export const reply = item('reply')
export const tool = item('tool')

/** How any session answers a message: honestly, since nothing runs here. */
export const DEMO_ANSWER =
  'This is the demo, so nothing runs here. On your own machine this message goes to the agent in its terminal, as if you had typed it there.'
