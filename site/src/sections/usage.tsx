import { TriangleAlert } from 'lucide-react'
import { Section, SectionHeading } from '@/components/ui/section'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { figures, usage, usageRows } from '@/content/usage'
import { ink, look } from '@/components/ui/intents'

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
            className={`${look.inkRule} flex flex-col gap-2 pl-4`}
          >
            <dt className={ink.figure}>{figure}</dt>
            <dd className={ink.inkCopy}>{text}</dd>
          </div>
        ))}
      </dl>
      <div className={`${look.inkCard} mt-16 p-4 sm:p-5`}>
        <p className={`${ink.label} mb-2`}>Daemons · usage</p>
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
                <TableCell>
                  <span className={`${ink.strong} flex items-center gap-1.5`}>
                    {row.machine}
                    {row.alert && <TriangleAlert className={`${ink.warning} size-3.5`} aria-label="Over a limit" />}
                  </span>
                </TableCell>
                <TableCell numeric>{row.cpu1m.toFixed(1)}%</TableCell>
                <TableCell numeric>{row.cpu10m.toFixed(1)}%</TableCell>
                <TableCell numeric>{row.rssMb} MB</TableCell>
                <TableCell numeric>{row.tickMs} ms</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {usageRows
          .filter((row) => row.alert)
          .map((row) => (
            <p key={row.machine} className={`${look.alert} mt-3 flex gap-2 p-2.5`}>
              <TriangleAlert className={`${ink.warning} mt-0.5 size-4 shrink-0`} aria-hidden />
              <span>
                <span className={ink.strong}>{row.machine}:</span> {row.alert}
              </span>
            </p>
          ))}
      </div>
    </Section>
  )
}
