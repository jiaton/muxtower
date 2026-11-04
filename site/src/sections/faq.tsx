import { RichText } from '@/components/shared/rich-text'
import { Section, SectionHeading } from '@/components/shared/section'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { faqTitle, questions } from '@/content/faq'

export function Faq() {
  return (
    <Section id="faq">
      <SectionHeading title={faqTitle} />
      <Accordion type="single" collapsible className="max-w-3xl">
        {questions.map((item) => (
          <AccordionItem key={item.q} value={item.q}>
            <AccordionTrigger className="text-base">{item.q}</AccordionTrigger>
            <AccordionContent className="text-base leading-relaxed text-muted-foreground">
              <RichText text={item.a} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  )
}
