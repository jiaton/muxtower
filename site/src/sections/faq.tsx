import { RichText } from '@/components/shared/rich-text'
import { Section, SectionHeading } from '@/components/shared/section'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { faqTitle, questions } from '@/content/faq'

export function Faq() {
  return (
    <Section id="faq">
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="lg:sticky lg:top-24">
          <SectionHeading eyebrow="FAQ" title={faqTitle} />
        </div>
        <Accordion type="single" collapsible>
          {questions.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger className="text-base">{item.q}</AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                <RichText text={item.a} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  )
}
