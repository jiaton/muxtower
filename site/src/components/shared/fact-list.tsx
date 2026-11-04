import { Check } from 'lucide-react'
import { RichText } from './rich-text'

/** A few facts, one sentence each: what a section claims, checkable. */
export function FactList({ facts }: { facts: string[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {facts.map((fact, i) => (
        <li key={fact} data-reveal-item style={{ '--i': i } as React.CSSProperties} className="flex gap-3 leading-relaxed">
          <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <RichText text={fact} />
          </span>
        </li>
      ))}
    </ul>
  )
}
