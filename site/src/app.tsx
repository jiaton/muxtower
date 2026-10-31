import { Demo } from '@/sections/demo'
import { Faq } from '@/sections/faq'
import { Features } from '@/sections/features'
import { Footer } from '@/sections/footer'
import { GetStarted } from '@/sections/get-started'
import { Header } from '@/sections/header'
import { Hero } from '@/sections/hero'
import { HowItWorks } from '@/sections/how-it-works'
import { Security } from '@/sections/security'

/** The whole page: the same tree is rendered to HTML at build time and hydrated in the browser. */
export function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Demo />
        <HowItWorks />
        <GetStarted />
        <Features />
        <Security />
        <Faq />
      </main>
      <Footer />
    </>
  )
}
