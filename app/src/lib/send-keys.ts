/** The send shortcut: ⌘↵ on a Mac (and iPhone, iPad), Ctrl+Enter elsewhere. */
export const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const SEND_KEYS = MAC ? '⌘↵' : 'Ctrl+↵'

/** Whether a key press is the send shortcut: ⌘ (Ctrl off a Mac) with Enter, never with Shift or Alt. */
export function isSendShortcut(e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; code: string }) {
  const command = MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  return command && !e.shiftKey && !e.altKey && (e.code === 'Enter' || e.code === 'NumpadEnter')
}
