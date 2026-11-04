import { FactList } from '@/components/shared/fact-list'
import { Section, SectionHeading } from '@/components/shared/section'
import { Terminal } from '@/components/shared/terminal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { directTabs, joinTranscript } from '@/content/lists'
import { hub } from '@/content/page'

export function Hub() {
  return (
    <Section id="hub">
      <div className="grid items-start gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading label={hub.label} title={hub.title} lead={hub.lead} />
          <FactList facts={hub.facts} />
        </div>
        <Terminal title="join a machine to the hub" lines={joinTranscript} />
      </div>
      <div className="mt-14 flex max-w-3xl flex-col gap-4">
        <h3 className="text-xl font-semibold">{hub.direct.title}</h3>
        <p className="leading-relaxed text-muted-foreground">{hub.direct.lead}</p>
        <Tabs defaultValue={directTabs[0].id}>
          <TabsList>
            {directTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {directTabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="flex flex-col gap-3">
              <Terminal title="on the machine joined to the hub" lines={tab.lines} />
              <p className="text-sm text-muted-foreground">{tab.note}</p>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Section>
  )
}
