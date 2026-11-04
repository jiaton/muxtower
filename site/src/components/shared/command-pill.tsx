import { CopyButton } from './terminal'

/** One command on a line of its own, to copy: the install command, under the page's title. */
export function CommandPill({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card py-1 pr-1 pl-3 font-mono text-sm">
      <span className="text-muted-foreground select-none">$</span>
      {command}
      <CopyButton text={command} />
    </div>
  )
}
