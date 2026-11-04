import { Section, SectionHeading } from '@/components/shared/section'
import { Terminal } from '@/components/shared/terminal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { installTabs } from '@/content/lists'
import { install } from '@/content/page'

export function Install() {
  return (
    <Section id="install">
      <SectionHeading label={install.label} title={install.title} lead={install.lead} />
      <Tabs defaultValue={installTabs[0].id} className="max-w-3xl">
        <TabsList>
          {installTabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {installTabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="flex flex-col gap-3">
            <Terminal title="on the machine your agents run on" lines={tab.lines} />
            <p className="text-sm text-muted-foreground">{tab.note}</p>
          </TabsContent>
        ))}
      </Tabs>
    </Section>
  )
}
