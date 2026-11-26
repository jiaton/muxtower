import { Checkbox } from '@/components/ui/checkbox'
import { ink, look } from '@/components/ui/intents'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { usePlanUsage, useSetPlanUsageEnabled } from '../api/use-plan-usage'
import { useNow } from '../hooks/use-now'
import { THRESHOLDS, usePlanUsagePrefs } from '../store'
import { AccountUsage } from './account-usage'

/** Daemons › Plan usage: every account the machines' CLIs are signed into, a row each, with its windows, its
 *  per-model limits and its machines; the owner's switch (the hub's, for every machine) and this device's
 *  threshold. Nothing from a hub that does not report it. */
export function PlanUsageSection() {
  const usage = usePlanUsage()
  const setEnabled = useSetPlanUsageEnabled()
  const threshold = usePlanUsagePrefs((s) => s.threshold)
  const setThreshold = usePlanUsagePrefs((s) => s.setThreshold)
  const now = useNow()
  const data = usage.data
  if (!data) return null
  const accounts = data.accounts ?? []
  return (
    <section id="plan-usage" aria-labelledby="plan-usage-title" className="flex scroll-mt-4 flex-col gap-2">
      <h2 id="plan-usage-title" className={ink.label}>
        Plan usage
      </h2>
      <p className={ink.hint}>The Claude and Codex subscriptions your machines' CLIs are signed into, checked every 5 minutes.</p>
      {data.enabled && accounts.length ? (
        <ul className={`${look.list} flex flex-col`}>
          {accounts.map((a) => (
            <li key={`${a.provider}:${a.account}`} className="p-3">
              <AccountUsage account={a} accounts={accounts} now={now} threshold={threshold} full />
            </li>
          ))}
        </ul>
      ) : data.enabled ? (
        <p className={ink.meta}>No machine has reported a signed-in Claude or Codex yet.</p>
      ) : null}
      <label className={`${ink.body} flex items-start gap-2`}>
        <Checkbox
          checked={data.enabled}
          disabled={setEnabled.isPending}
          onChange={(e) => setEnabled.mutate(e.target.checked)}
          aria-label="Show plan usage"
        />
        <span>
          Show plan usage <span className={ink.quiet}>· in the header and here, on every device. Off, no machine checks.</span>
        </span>
      </label>
      {setEnabled.isError ? <p className={ink.noteDanger}>Could not change it: {setEnabled.error.message}</p> : null}
      {data.enabled ? (
        <Label className="max-w-xs">
          Highlight a window from (this device)
          <Select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
            {THRESHOLDS.map((t) => (
              <option key={t} value={t}>
                {t}%
              </option>
            ))}
          </Select>
        </Label>
      ) : null}
    </section>
  )
}
