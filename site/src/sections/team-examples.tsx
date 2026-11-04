import { ArrowRight, Monitor } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { teamExamples } from '@/content/teams'

/** Three made-up projects with their teams: who does what, on which machine, and one piece of work
 *  going around. */
export function TeamExamples() {
  return (
    <Tabs defaultValue={teamExamples[0].project} className="mt-14">
      <TabsList>
        {teamExamples.map((t) => (
          <TabsTrigger key={t.project} value={t.project} className="font-mono">
            {t.project}
          </TabsTrigger>
        ))}
      </TabsList>
      {teamExamples.map((t) => (
        <TabsContent key={t.project} value={t.project} className="mt-4 grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t.about}</p>
            <ul className="flex flex-col gap-4">
              {t.members.map((m) => (
                <li key={m.role} className="flex flex-col gap-1 border-t border-border pt-3">
                  <p className="flex items-center gap-2">
                    <Badge>{m.role}</Badge>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Monitor className="size-3.5" aria-hidden /> {m.machine}
                    </span>
                  </p>
                  <p className="leading-relaxed">{m.does}</p>
                </li>
              ))}
            </ul>
          </div>
          <ol aria-label={`How work goes around ${t.project}`} className="flex flex-col gap-3">
            {t.flow.map((h, i) => (
              <li key={i} className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3">
                <p className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  {h.from} <ArrowRight className="size-3" aria-label="to" /> {h.to}
                  {h.from !== 'you' && h.to !== 'you' && <span>· send_task</span>}
                </p>
                <p className="text-sm leading-relaxed">{h.text}</p>
              </li>
            ))}
          </ol>
        </TabsContent>
      ))}
    </Tabs>
  )
}
