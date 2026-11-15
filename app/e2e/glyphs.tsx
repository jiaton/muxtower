// The glyph suite's page (e2e/glyphs.spec.ts, served by Vite's dev server, never built into the app): one
// fixture drawn by the real TerminalView, as wide as the fixture's columns, with the app's styles and fonts.
import { createRoot } from 'react-dom/client'
import { TerminalView } from '@/features/terminal/components/terminal-view'
import { FIXTURES } from '@/features/terminal/glyph-fixtures'
import '@/styles/tokens.css'

const query = new URLSearchParams(location.search)
const fixture = FIXTURES.find((f) => f.name === query.get('fixture')) ?? FIXTURES[0]!
const cols = Number(query.get('cols') ?? 46)

createRoot(document.getElementById('root')!).render(
  <div id="pane" data-cols={cols} style={{ width: `${Math.ceil(cols * 12 * 0.62) + 48}px`, height: '420px', display: 'flex' }}>
    <TerminalView ansi={fixture.lines(cols).join('\n')} fontSize={12} />
  </div>,
)
