import {
  BellRing,
  Bot,
  DoorOpen,
  FolderGit2,
  Gauge,
  Glasses,
  Hand,
  Keyboard,
  Layers,
  MessagesSquare,
  Mic,
  MonitorSmartphone,
  Network,
  ScanEye,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Section, SectionHeading } from '@/components/ui/section'
import { type FeatureId, featureList, features } from '@/content/features'

const ICONS: Record<FeatureId, ReactNode> = {
  asks: <ScanEye />,
  approve: <Hand />,
  team: <Users />,
  machines: <Network />,
  projects: <FolderGit2 />,
  conversation: <MessagesSquare />,
  push: <BellRing />,
  voice: <Mic />,
  mcp: <Layers />,
  glasses: <Glasses />,
  codex: <Bot />,
  desktop: <MonitorSmartphone />,
  keys: <Keyboard />,
  usage: <Gauge />,
  gate: <DoorOpen />,
}

export function Features() {
  return (
    <Section id="features">
      <SectionHeading eyebrow={features.eyebrow} title={features.title} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {featureList.map((feature) => (
          <Card key={feature.id} icon={ICONS[feature.id]} title={feature.title}>
            {feature.text}
          </Card>
        ))}
      </div>
    </Section>
  )
}
