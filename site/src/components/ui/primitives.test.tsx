import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion'
import { Badge } from './badge'
import { Button } from './button'
import { Progress } from './progress'
import { Separator } from './separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

// The generated shadcn/ui primitives, rendered once each: a broken one breaks every section using it.
describe('primitives', () => {
  it('render', () => {
    render(
      <>
        <Button variant="step" size="step">
          Step
        </Button>
        <Badge variant="outline">fork</Badge>
        <Progress value={40} aria-label="p" />
        <Separator />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Step' })).toBeInTheDocument()
    expect(screen.getByText('fork')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('tabs switch with the keyboard', async () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">first</TabsContent>
        <TabsContent value="b">second</TabsContent>
      </Tabs>,
    )
    await userEvent.click(screen.getByRole('tab', { name: 'A' }))
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'true')
  })

  it('accordion opens', async () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="q">
          <AccordionTrigger>Q</AccordionTrigger>
          <AccordionContent>A</AccordionContent>
        </AccordionItem>
      </Accordion>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Q' }))
    expect(screen.getByText('A')).toBeVisible()
  })
})
