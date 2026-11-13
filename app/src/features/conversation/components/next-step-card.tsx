import { Button } from '@/components/ui/button'
import type { ConversationItem } from '@/lib/api/types'
import { ink, look } from '@/components/ui/intents'

/** The next step the agent offers at the end of its turn (Claude desktop's box): its recap, its question
 *  and the replies to pick, each sent as the owner's message. */
export function NextStepCard({ item, onReply }: { item: ConversationItem; onReply?: (text: string) => void }) {
  return (
    <section aria-label="Next step" className={`${look.panel} flex flex-col gap-2 p-3`}>
      {item.text ? <p className={ink.quiet}>{item.text}</p> : null}
      {item.ask ? <p className={ink.strong}>{item.ask}</p> : null}
      {onReply ? (
        <div className="flex flex-wrap gap-2">
          {(item.actions ?? []).map((action, i) => (
            <Button
              key={action.label}
              size="sm"
              variant={i === 0 ? 'primary' : 'secondary'}
              title={action.message}
              onClick={() => onReply(action.message)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
