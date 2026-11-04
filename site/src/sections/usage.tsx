import { TriangleAlert } from 'lucide-react'
import { RichText } from '@/components/shared/rich-text'
import { Section, SectionHeading } from '@/components/shared/section'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { figures, usage, usageRows } from '@/content/usage'

/** What muxtower costs to run, in figures, beside the Daemons page that shows it live. */
export function Usage() {
  return (
    <Section id="usage">
      <SectionHeading label={usage.label} title={usage.title} lead={usage.lead} />
      <div className="mt-12 grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-[6rem_minmax(0,1fr)]">
          {figures.map(({ figure, text }) => (
            <div key={figure} className="contents">
              <dt className="font-mono text-2xl font-semibold tracking-tight text-primary tabular-nums sm:text-right">{figure}</dt>
              <dd className="leading-relaxed text-fg-muted max-sm:-mt-4">
                <RichText text={text} />
              </dd>
            </div>
          ))}
        </dl>
        <UsageTable />
      </div>
    </Section>
  )
}

function UsageTable() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:sticky lg:top-24">
      <p className="text-sm font-medium">Daemons · usage</p>
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
          <p key={row.machine} className="flex gap-2 rounded-md bg-state-permission-soft p-2.5 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-state-permission" aria-hidden />
            <span>
              <span className="font-medium">{row.machine}:</span> {row.alert}
            </span>
          </p>
        ))}
      <p className="text-xs text-fg-muted">
        The same numbers for every machine, in the app and at <code className="font-mono">GET /v1/usage</code>.
      </p>
    </div>
  )
}
