import type { ComponentProps } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/cn'
import { CodeBlock } from './code-block'

type Tag = 'h3' | 'h4' | 'h5' | 'p' | 'ul' | 'ol' | 'li' | 'blockquote' | 'th' | 'td'

/** An element with our classes; react-markdown's `node` prop stays off the DOM. */
const styled = (Tag: Tag, className: string) =>
  function Styled({ node: _node, ...props }: ComponentProps<Tag> & { node?: unknown }) {
    return <Tag className={className} {...(props as object)} />
  }

const components: Components = {
  h1: styled('h3', 'mt-1 text-base font-semibold'),
  h2: styled('h3', 'mt-1 text-base font-semibold'),
  h3: styled('h4', 'mt-1 font-semibold'),
  h4: styled('h5', 'font-semibold'),
  h5: styled('h5', 'font-semibold'),
  h6: styled('h5', 'font-semibold'),
  p: styled('p', 'leading-relaxed'),
  ul: styled('ul', 'list-disc space-y-0.5 pl-5'),
  ol: styled('ol', 'list-decimal space-y-0.5 pl-5'),
  li: styled('li', 'pl-0.5 [&>input]:mr-1.5'),
  blockquote: styled('blockquote', 'border-l-2 border-border pl-3 text-fg-muted'),
  pre: (props) => (
    <CodeBlock
      {...props}
      className="overflow-x-auto rounded-md bg-surface-muted p-2.5 font-mono text-xs leading-snug [&_code]:bg-transparent [&_code]:p-0"
    />
  ),
  th: styled('th', 'border border-border bg-surface-muted px-2 py-1 text-left font-medium'),
  td: styled('td', 'border border-border px-2 py-1 align-top'),
  a: ({ node: _node, href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-accent underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ node: _node, className, children }) => (
    <code className={cn('rounded bg-surface-muted px-1 py-0.5 font-mono', className)}>{children}</code>
  ),
  hr: () => <hr className="border-border" />,
  table: ({ node: _node, children }) => (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
}

/** Agents' replies are Markdown (GitHub flavour: tables, task lists, strikethrough). Raw HTML in them
 *  is shown as text, never rendered. Wide tables and code scroll on their own, never the page; code blocks
 *  have a Copy button. */
export function Markdown({ children, className }: { children: string; className?: ComponentProps<'div'>['className'] }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2 break-words', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkCjkFriendly]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
