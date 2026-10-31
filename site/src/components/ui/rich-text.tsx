/** Copy with `code` spans written in backticks (the content files keep their text plain). */
export function RichText({ text }: { text: string }) {
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') ? (
      <code key={i} className="rounded-sm bg-surface-muted px-1 py-0.5 font-mono text-sm text-fg">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  )
}
