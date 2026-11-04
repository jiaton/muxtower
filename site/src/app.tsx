import { Faq } from '@/sections/faq'
import { Footer } from '@/sections/footer'
import { Header } from '@/sections/header'
import { Hero } from '@/sections/hero'
import { Hub } from '@/sections/hub'
import { Install } from '@/sections/install'
import { Reach } from '@/sections/reach'
import { Security } from '@/sections/security'
import { Sources } from '@/sections/sources'
import { Team } from '@/sections/team'

/** The page, top to bottom: the demo first, then one claim per section, each with the real thing. */
export function App() {
  return (
    <div id="top" className="min-h-dvh bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <Hub />
        <Team />
        <Sources />
        <Reach />
        <Security />
        <Install />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
