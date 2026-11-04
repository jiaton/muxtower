import { TriangleAlert } from 'lucide-react'
import { FactList } from '@/components/shared/fact-list'
import { Section, SectionHeading } from '@/components/shared/section'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usage, usageRows } from '@/content/usage'

export function Usage() {
  return (
    <Section id="usage">
      <div className="grid items-start gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading label={usage.label} title={usage.title} lead={usage.lead} />
          <FactList facts={usage.facts} />
        </div>
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
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
        </div>
      </div>
    </Section>
  )
}
