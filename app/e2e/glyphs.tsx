// The glyph suite's page (e2e/glyphs.spec.ts, served by Vite's dev server, never built into the app): one
// fixture drawn by the real TerminalView, as wide as the fixture's columns, with the app's styles and fonts.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TerminalView } from '@/features/terminal/components/terminal-view'
import { FIXTURES } from '@/features/terminal/glyph-fixtures'
import { snapshot } from '@/lib/diagnostics'
import '@/styles/tokens.css'

const query = new URLSearchParams(location.search)
const fixture = FIXTURES.find((f) => f.name === query.get('fixture')) ?? FIXTURES[0]!
const cols = Number(query.get('cols') ?? 46)

// `?perf=<lines>`: a scrollback that long of every fixture's lines over and over (most rows painted), and
// `window.stream(n)` appending n more lines one frame at a time, as output streams in; `window.renderMs()`
// what the view measured (lib/diagnostics, the app's own renderMs).
const perf = Number(query.get('perf') ?? 0)
const pool = FIXTURES.flatMap((f) => f.lines(cols))
// Numbered, as real output is never the same line over and over (the view aligns screens on such lines).
const numbered = (i: number) => `${i} ${pool[i % pool.length]!}`
const lines = perf ? Array.from({ length: perf }, (_, i) => numbered(i)) : fixture.lines(cols)

let next = perf

function Page() {
  const [shown, setShown] = useState(lines)
  Object.assign(window, {
    stream: async (n: number) => {
      for (let i = 0; i < n; i++) {
        setShown((all) => [...all.slice(1), numbered(next++)])
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      }
    },
    renderMs: () => {
      const s = snapshot()
      return { avg: s.renderAvgMs, max: s.renderMaxMs }
    },
  })
  return (
    <div id="pane" data-cols={cols} style={{ width: `${Math.ceil(cols * 12 * 0.62) + 48}px`, height: '420px', display: 'flex' }}>
      <TerminalView ansi={shown.join('\n')} fontSize={12} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Page />)
