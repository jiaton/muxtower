import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { teamExamples } from '@/content/teams'
import { cn } from '@/lib/utils'

/** Three made-up projects with their teams: who is on which machine, and one piece of work going around. */
export function TeamExamples() {
  return (
    <Tabs defaultValue={teamExamples[0].project}>
      <TabsList className="max-w-full justify-start overflow-x-auto">
        {teamExamples.map((t) => (
          <TabsTrigger key={t.project} value={t.project} className="font-mono">
            {t.project}
          </TabsTrigger>
        ))}
      </TabsList>
      {teamExamples.map((t) => (
        <TabsContent key={t.project} value={t.project} className="mt-4">
          <Card className="gap-5 p-5 shadow-card-soft sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              {t.members.map((m) => (
                <Badge key={m.role} variant="secondary" className="gap-1.5 font-mono">
                  {m.role}
                  <span className="text-muted-foreground">@{m.machine}</span>
                </Badge>
              ))}
              <span className="ml-auto text-sm text-muted-foreground">{t.about}</span>
            </div>
            <ol aria-label={`How work goes around ${t.project}`} className="flex flex-col gap-2.5">
              {t.flow.map((h, i) => {
                const mine = h.from === 'you'
                return (
                  <li key={i} className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
                    <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      {h.from} <ArrowRight className="size-3" aria-label="to" /> {h.to}
                    </p>
                    <p
                      className={cn(
                        'max-w-md rounded-xl px-3.5 py-2 text-sm leading-relaxed',
                        mine ? 'bg-primary text-primary-foreground' : 'bg-muted',
                      )}
                    >
                      {h.text}
                    </p>
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
