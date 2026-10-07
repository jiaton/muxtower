import type { ReactNode } from 'react'

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      {icon ? <div className="text-fg-muted [&_svg]:size-8">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {children ? <div className="text-sm text-fg-muted">{children}</div> : null}
    </div>
  )
}
