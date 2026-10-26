/** How this browser can put muxtower on the home screen, if it is not there already:
 *  - `prompt`: it offered to install the app (`beforeinstallprompt`), so one tap installs it. Chrome on
 *    Android installs a real app this way, whose notifications carry the app's name and icon;
 *  - `ios`: Safari on iPhone or iPad, which installs only by hand (Share › Add to Home Screen), and
 *    gives web apps push notifications only once they are added;
 *  - `menu`: Chrome on Android that has not offered yet (it waits until the page has been used a little,
 *    and never offers when the app is installed already): its own menu installs it;
 *  - `shortcut`: another Android browser (Vivaldi, Firefox, …), which adds at most a shortcut whose
 *    notifications stay under the browser's name;
 *  - null: installed already, or nothing worth saying (a desktop browser that has not offered). */
export type InstallOption = 'prompt' | 'ios' | 'menu' | 'shortcut' | null

export interface InstallContext {
  standalone: boolean
  canPrompt: boolean
  userAgent: string
  /** `navigator.userAgentData.brands`, where the browser has it. Vivaldi and others send Chrome's
   *  user agent string, but not its "Google Chrome" brand. */
  brands?: string[]
}

export function installOption({ standalone, canPrompt, userAgent, brands }: InstallContext): InstallOption {
  if (standalone) return null
  if (canPrompt) return 'prompt'
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && /Mobile\//.test(userAgent))) return 'ios'
  if (/Android/.test(userAgent)) return brands?.includes('Google Chrome') ? 'menu' : 'shortcut'
  return null
}
