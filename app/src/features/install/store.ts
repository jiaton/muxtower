import { create } from 'zustand'

/** Chrome's install prompt (not in TypeScript's DOM types). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallState {
  /** The browser's install prompt, kept until it is used: it can be shown once. */
  prompt: InstallPromptEvent | null
  installed: boolean
}

export const useInstallStore = create<InstallState>()(() => ({ prompt: null, installed: false }))

/** Keeps the install prompt for later. Call before the app renders: the browser offers it once, early,
 *  likely before the page that shows the Install button has loaded. */
export function listenForInstall() {
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault() // no mini-infobar: the app shows its own button
    useInstallStore.setState({ prompt: event as InstallPromptEvent })
  })
  addEventListener('appinstalled', () => useInstallStore.setState({ prompt: null, installed: true }))
}

export async function promptInstall() {
  const prompt = useInstallStore.getState().prompt
  if (!prompt) return
  useInstallStore.setState({ prompt: null })
  await prompt.prompt()
  if ((await prompt.userChoice).outcome === 'accepted') useInstallStore.setState({ installed: true })
}
