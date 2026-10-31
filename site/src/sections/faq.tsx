import { Plus } from 'lucide-react'
import { RichText } from '@/components/ui/rich-text'
import { Section, SectionHeading } from '@/components/ui/section'
import { faq, questions } from '@/content/faq'

/** Native disclosure: works before the page's script has loaded, and with none. */
export function Faq() {
  return (
    <Section id="faq">
      <SectionHeading eyebrow={faq.eyebrow} title={faq.title} />
      <div className="max-w-3xl divide-y divide-border border-y border-border">
        {questions.map((item) => (
          <details key={item.q} className="group py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-3 font-medium focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
              {item.q}
              <Plus aria-hidden className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-45" />
            </summary>
            <p className="pb-4 leading-relaxed text-fg-muted">
              <RichText text={item.a} />
            </p>
          </details>
        ))}
      </div>
    </Section>
  )
}
