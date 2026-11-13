import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { teamExamples } from '@/content/teams'
import { cn } from '@/lib/utils'
import { handoff, ink } from '@/components/ui/intents'

/** Three made-up projects with their teams: who is on which machine, and one piece of work going around. */
export function TeamExamples() {
  return (
    <Tabs defaultValue={teamExamples[0].project}>
      <TabsList className="max-w-full justify-start overflow-x-auto">
        {teamExamples.map((t) => (
          <TabsTrigger key={t.project} value={t.project} code>
            {t.project}
          </TabsTrigger>
        ))}
      </TabsList>
      {teamExamples.map((t) => (
        <TabsContent key={t.project} value={t.project} className="mt-4">
          <Card soft className="gap-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              {t.members.map((m) => (
                <Badge key={m.role} variant="secondary" text="code" className="gap-1.5">
                  {m.role}
                  <span className={ink.quiet}>@{m.machine}</span>
                </Badge>
              ))}
              <span className={`${ink.note} ml-auto`}>{t.about}</span>
            </div>
            <ol aria-label={`How work goes around ${t.project}`} className="flex flex-col gap-2.5">
              {t.flow.map((h, i) => {
                const mine = h.from === 'you'
                return (
                  <li key={i} className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
                    <p className={`${ink.codeMeta} flex items-center gap-1`}>
                      {h.from} <ArrowRight className="size-3" aria-label="to" /> {h.to}
                    </p>
                    <p className={`${handoff({ mine })} max-w-md`}>{h.text}</p>
                  </li>
                )
              })}
            </ol>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  )
}
