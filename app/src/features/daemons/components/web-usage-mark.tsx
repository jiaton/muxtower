import { WarningMark } from '@/components/ui/warning-mark'
import { alertText } from '@/lib/daemons/usage'
import { alertKey, webAlerts } from '@/lib/diagnostics-alerts'
import { useDismissedAlerts } from '@/lib/dismissed-alerts'
import { useWebUsage } from '@/lib/use-web-usage'

/** By the app's name: only what is severe and fixed by an action (the GPU lost, the heap near what a phone
 *  keeps, the page's own elements tripled: restart or reload), until dismissed for that condition. The rest
 *  (slow keys, a blocked minute, growth under that) is said in Daemons › Diagnostics only: it must not nag. */
export function WebUsageMark() {
  const dismissed = useDismissedAlerts((s) => s.keys)
  const dismiss = useDismissedAlerts((s) => s.dismiss)
  const severe = webAlerts(useWebUsage()).filter((a) => a.severe && !dismissed.includes(alertKey(a)))
  return (
    <WarningMark
      what="This app"
      lines={severe.map(alertText)}
      details={['More under Daemons › Diagnostics.']}
      onDismiss={() => severe.forEach((a) => dismiss(alertKey(a)))}
    />
  )
}
