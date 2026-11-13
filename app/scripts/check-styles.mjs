// Enforces app/AGENTS.md › Styling: features write layout only. Outside src/components/ui (and the HTML that
// lib/ansi.ts generates), (1) no class string holds a visual class: every look comes from a primitive, a
// variant or a role of components/ui; (2) gap, padding and margin stay on the spacing scale; (3) no native
// control (<button>, <input>, <select>, <textarea>, a styled <a>): the primitives are used.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('../src', import.meta.url).pathname
const EXEMPT = new Set(['lib/ansi.ts', 'lib/api/schema.d.ts'])
const VISUAL =
  /^(?:[\w-]+:)*-?(?:text-(?!left$|right$|center$|justify$|start$|end$|wrap$|nowrap$|ellipsis$|clip$|balance$|pretty$)|font-|tracking-|leading-|uppercase$|lowercase$|capitalize$|italic$|tabular-nums$|bg-|border|divide-|rounded|shadow|ring|outline|opacity-|underline|decoration-|line-through$|no-underline$|animate-|transition|antialiased$|placeholder:|fill-|stroke-|from-|via-|to-)/
const GAP = new Set(['0', '0.5', '1', '1.5', '2', '3', '4'])
const PAD = new Set(['0', '0.5', '1', '1.5', '2', '3', '4', '6', '8', '10']) // 8, 10: an indent past an icon
const MARGIN = new Set(['0', '0.5', '1', '1.5', '2', '3', '4', 'auto'])
const CLASSY = /^[\w:/.[\]()%&!*@-]+$/ // what a class looks like
// A template literal is read with its ${…} parts taken out: what is written around them is classes too.
const LITERAL = /(\b[\w-]+=)?(?:'([^'\n]*)'|"([^"\n]*)"|`((?:[^`\\$]|\$(?!\{)|\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*)`)/g

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.tsx?$/.test(name)) files.push(path)
  }
}
walk(ROOT)

let failures = 0
const fail = (rel, text, index, what) => {
  console.error(`src/${rel}:${text.slice(0, index).split('\n').length}: ${what}`)
  failures++
}
for (const file of files) {
  const rel = relative(ROOT, file)
  if (rel.startsWith('components/ui/') || EXEMPT.has(rel) || /\.test\.tsx?$/.test(rel) || rel.endsWith('.gen.ts')) continue
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(LITERAL)) {
    const attr = m[1]
    if (attr && attr !== 'className=') continue // another attribute's value (variant="outline"), not classes
    const tokens = (m[2] ?? m[3] ?? (m[4] ?? '').replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ' ')).split(/\s+/).filter(Boolean)
    if (!tokens.length || !tokens.every((t) => CLASSY.test(t))) continue
    if (tokens.length === 1 && !tokens[0].includes('-') && attr !== 'className=') continue // a bare word, not surely a class
    for (const t of tokens) {
      const bare = t.replace(/^(?:[\w-]+:)*/, '')
      if (VISUAL.test(t)) fail(rel, text, m.index, `"${t}" is a look: use a primitive, variant or role of components/ui`)
      const step = bare.match(/^-?(gap(?:-[xy])?|p[xytrbl]?|m[xytrbl]?)-(.+)$/)
      if (!step) continue
      const [, kind, value] = step
      if (value.includes('env(')) continue // the safe area: layout
      const scale = kind.startsWith('gap') ? GAP : kind.startsWith('p') ? PAD : MARGIN
      if (bare.startsWith('-') || !scale.has(value)) fail(rel, text, m.index, `"${t}" is off the spacing scale`)
    }
  }
  if (rel.endsWith('.tsx'))
    for (const m of text.matchAll(/<(button|input|select|textarea)\b|<a\b(?=[^>]*\bclassName=)/g))
      fail(rel, text, m.index, `<${m[1] ?? 'a'}>: use the components/ui control (Button, Input, Select, Textarea, FilePicker, TextLink)`)
}
if (failures) {
  console.error(`\n${failures} styling violation(s): features write layout only (app/AGENTS.md › Styling).`)
  process.exit(1)
}
