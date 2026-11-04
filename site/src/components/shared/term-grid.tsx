import { cn } from '@/lib/utils'
import { RichText } from './rich-text'

/** Named items with a sentence each, in columns divided by rules (not boxed cards). */
export function TermGrid({ items, columns = 3 }: { items: { title: string; text: string }[]; columns?: 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-10 gap-y-8 sm:grid-cols-2', columns === 3 && 'lg:grid-cols-3')}>
      {items.map((item) => (
        <div key={item.title} className="flex flex-col gap-2 border-t border-border pt-4">
          <dt className="font-medium">{item.title}</dt>
          <dd className="leading-relaxed text-muted-foreground">
            <RichText text={item.text} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
