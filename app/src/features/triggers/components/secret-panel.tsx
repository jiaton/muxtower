import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { CodeBlock } from '@/components/ui/code-block'
import { ink } from '@/components/ui/intents'
import { useDaemon } from '@/lib/daemons/store'
import type { Trigger } from '@/lib/api/types'
import { cliExample, curlExample, LAN_PLACEHOLDER, lanBase } from '../model/fire-url'

/** A trigger's secret, shown this once (after it was made, or rotated), and how to fire it with it. */
export function SecretPanel({ daemonId, trigger, secret, onDone }: { daemonId: string; trigger: Trigger; secret: string; onDone: () => void }) {
  const base = lanBase(useDaemon(daemonId)?.url ?? '')
  return (
    <div className="flex flex-col gap-3" aria-label="Secret">
      <Banner tone="warning">Copy the secret now: it is shown only this once. Rotate it to get a new one.</Banner>
      <div className="flex flex-col gap-1">
        <h3 className={ink.eyebrow}>Secret</h3>
        <CodeBlock snippet copyLabel="Copy the secret" aria-label="Trigger secret">
          {secret}
        </CodeBlock>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className={ink.eyebrow}>Fire it from a script</h3>
        <CodeBlock snippet copyLabel="Copy the curl command">{curlExample(base, trigger.id, secret)}</CodeBlock>
        <p className={ink.meta}>
          {base === LAN_PLACEHOLDER ? 'Put in the address the hub has on its network. ' : null}
          The public hostname won't work for triggers yet.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className={ink.eyebrow}>Or on the hub, or a computer joined to it</h3>
        <CodeBlock snippet copyLabel="Copy the muxtower command">{cliExample(trigger.name)}</CodeBlock>
      </div>
      <Button className="self-end" onClick={onDone}>
        Done
      </Button>
    </div>
  )
}
