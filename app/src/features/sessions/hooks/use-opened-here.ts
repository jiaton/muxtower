import { useState } from 'react'

/** Entry keys of the sessions opened while the list showed `listKey` (oldest first), for the list to
 *  keep once they leave it (`keptEntries`). `listed`: the session being opened is in the list; a session
 *  opened from elsewhere (a notification) is not kept. Forgotten when the list shows something else. */
export function useOpenedHere(listKey: string, selectedKey: string | undefined, listed: boolean): string[] {
  const [memory, setMemory] = useState({ listKey, selectedKey, opened: [] as string[] })
  // Adjusted while rendering (React's "information from previous renders"), not in an effect: the list
  // must keep the session on the very render that marks it read.
  if (memory.listKey !== listKey) {
    setMemory({ listKey, selectedKey, opened: [] })
  } else if (memory.selectedKey !== selectedKey) {
    const add = selectedKey && listed && !memory.opened.includes(selectedKey)
    setMemory({ listKey, selectedKey, opened: add ? [...memory.opened, selectedKey] : memory.opened })
  }
  return memory.opened
}
