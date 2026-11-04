import { ArrowUpRight } from 'lucide-react'
import { Section, SectionHeading } from '@/components/shared/section'
import { Terminal } from '@/components/shared/terminal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { config } from '@/config'
import { installTabs } from '@/content/lists'
import { hostedApp, install } from '@/content/page'

export function Install() {
  return (
    <Section id="install" tone="muted">
      <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col">
          <SectionHeading eyebrow={install.eyebrow} title={install.title} lead={install.lead} />
          {config.appUrl && (
            <Card className="gap-3 p-5 shadow-card-soft">
              <p className="font-medium">{hostedApp.title}</p>
              <p className="text-sm text-muted-foreground">{hostedApp.text}</p>
              <Button asChild variant="outline" className="self-start">
                <a href={config.appUrl} target="_blank" rel="noreferrer">
                  {hostedApp.action}
                  <ArrowUpRight />
                </a>
              </Button>
            </Card>
          )}
        </div>
        <Tabs defaultValue={installTabs[0].id}>
          <TabsList className="max-w-full justify-start overflow-x-auto">
            {installTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {installTabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-3 flex flex-col gap-3">
              <Terminal
                title={tab.id === 'join' ? 'on the hub, then on each machine' : 'on the machine your agents run on'}
                lines={tab.lines}
              />
              <p className="text-sm text-muted-foreground">{tab.note}</p>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Section>
  )
}
