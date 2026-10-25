import { AppWindow, Boxes, Code, Globe, Smartphone, SquareTerminal, type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  muxtower: Boxes,
  tmux: SquareTerminal,
  CLI: SquareTerminal,
  'Desktop app': AppWindow,
  'Mobile app': Smartphone,
  Web: Globe,
}

/** The icon of a source label (`sourceOf`). */
export const sourceIcon = (source: string): LucideIcon => ICONS[source] ?? Code
