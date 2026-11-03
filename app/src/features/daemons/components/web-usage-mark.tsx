import { WarningMark } from '@/components/ui/warning-mark'
import { alertText } from '@/lib/daemons/usage'
import { webAlerts } from '@/lib/diagnostics'
import { useWebUsage } from '@/lib/use-web-usage'

/** By the app's name: this page itself over a limit (drawing screens, its heap); see Daemons › Diagnostics. */
export function WebUsageMark() {
  const alerts = webAlerts(useWebUsage())
  return <WarningMark what="This app" lines={alerts.map(alertText)} details={['More under Daemons › Diagnostics.']} />
}
