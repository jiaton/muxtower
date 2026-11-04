import { TriangleAlert } from 'lucide-react'
import { Section, SectionHeading } from '@/components/shared/section'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { figures, usage, usageRows } from '@/content/usage'

/** What muxtower costs to run, in figures, beside the Daemons page that shows it live. The page's one
 *  dark band. */
export function Usage() {
  return (
    <Section id="usage" tone="ink">
      <SectionHeading eyebrow={usage.eyebrow} title={usage.title} lead={usage.lead} tone="ink" />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
        {figures.map(({ figure, text }, i) => (
          <div
            key={figure}
            data-reveal-item
            style={{ '--i': i } as React.CSSProperties}
            className="flex flex-col gap-2 border-l border-ink-border pl-4"
          >
            <dt className="font-mono text-3xl font-semibold tracking-tight text-ink-fg tabular-nums sm:text-4xl">{figure}</dt>
            <dd className="text-sm leading-relaxed text-ink-muted">{text}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-16 rounded-xl border border-ink-border bg-card p-4 text-card-foreground sm:p-5">
        <p className="mb-2 text-sm font-medium">Daemons · usage</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Machine</TableHead>
              <TableHead className="text-right">CPU 1 min</TableHead>
              <TableHead className="text-right">CPU 10 min</TableHead>
              <TableHead className="text-right">Memory</TableHead>
              <TableHead className="text-right">Round</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usageRows.map((row) => (
              <TableRow key={row.machine}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-1.5">
                    {row.machine}
                    {row.alert && <TriangleAlert className="size-3.5 text-state-permission" aria-label="Over a limit" />}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.cpu1m.toFixed(1)}%</TableCell>
                <TableCell className="text-right tabular-nums">{row.cpu10m.toFixed(1)}%</TableCell>
                <TableCell className="text-right tabular-nums">{row.rssMb} MB</TableCell>
                <TableCell className="text-right tabular-nums">{row.tickMs} ms</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {usageRows
          .filter((row) => row.alert)
          .map((row) => (
            <p key={row.machine} className="mt-3 flex gap-2 rounded-md bg-state-permission-soft p-2.5 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-state-permission" aria-hidden />
              <span>
                <span className="font-medium">{row.machine}:</span> {row.alert}
              </span>
            </p>
          ))}
      </div>
    </Section>
  )
}
