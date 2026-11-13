import { Download } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { installOption } from '../model/install'
import { promptInstall, useInstallStore } from '../store'
import { ink } from '@/components/ui/intents'

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const brands = () => (navigator as { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands.map((b) => b.brand)

/** Offers what this browser can do to put muxtower on the home screen (see `installOption`); nothing
 *  when it runs installed already. */
export function InstallApp() {
  const canPrompt = useInstallStore((s) => s.prompt !== null)
  const installed = useInstallStore((s) => s.installed)
  const running = standalone()
  const option = installOption({ standalone: running, canPrompt, userAgent: navigator.userAgent, brands: brands() })

  if (installed && !running) return <Section>Installed. Open muxtower from the home screen or the app list.</Section>
  if (option === 'prompt')
    return (
      <Section
        action={
          <Button className="self-start" onClick={() => void promptInstall()}>
            <Download /> Install app
          </Button>
        }
      >
        Install muxtower as an app: it opens without the browser's bars, and its notifications show its own name and icon.
      </Section>
    )
  if (option === 'ios')
    return (
      <Section>
        To get notifications on iPhone, add muxtower to the Home Screen: tap Share, then Add to Home Screen, and open it from there.
      </Section>
    )
  if (option === 'menu')
    return (
      <Section>
        Install muxtower as an app so that its notifications show its own name and icon: in Chrome's ⋮ menu, tap Install app (or Add to home
        screen, then Install). Installed already? Open it from the home screen.
      </Section>
    )
  if (option === 'shortcut')
    return (
      <Section>
        This browser can put muxtower on the home screen only as a shortcut, so its notifications show the browser's name and icon. To
        install it as an app, open this page in Chrome and pair it there: on this device, Add another device › Copy link, then open the link
        in Chrome.
      </Section>
    )
  return null
}

function Section({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={ink.label}>App</h2>
      <p className={ink.hint}>{children}</p>
      {action}
    </section>
  )
}
