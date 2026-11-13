// Enforces app/AGENTS.md token discipline: no raw colors or palette/arbitrary Tailwind values
// outside src/styles/tokens.css.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('../src', import.meta.url).pathname
// ansi.ts passes through the colors an agent's 256-color / true-color output asks for; theme colors
// still come from tokens.
const ALLOWED = new Set(['styles/tokens.css', 'lib/api/schema.d.ts', 'lib/ansi.ts'])
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white'
const RULES = [
  [/#[0-9a-fA-F]{3,8}\b/, 'raw hex color'],
  [/\b(?:rgba?|hsla?|oklch)\(/, 'raw color function'],
  [new RegExp(`\\b[a-z-]+-(?:${PALETTE})(?:-\\d{2,3})?\\b`), 'Tailwind palette class'],
  // Arbitrary values are fine for layout (h-[90dvh]) and variants (data-[state=open]:), never for visuals.
  [/\b(?:bg|text|border|ring|outline|shadow|rounded|fill|stroke|font|decoration|caret|accent|from|via|to)-\[/, 'arbitrary visual value'],
]

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.(tsx?|css)$/.test(name)) files.push(path)
  }
}
walk(ROOT)

let failures = 0
for (const file of files) {
  const rel = relative(ROOT, file)
  // Tests assert on rendered values; they style nothing.
  if (ALLOWED.has(rel) || rel.endsWith('.gen.ts') || /\.test\.tsx?$/.test(rel)) continue
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [re, what] of RULES) {
        if (re.test(line)) {
          console.error(`src/${rel}:${i + 1}: ${what}: ${line.trim()}`)
          failures++
        }
      }
    })
}
if (failures) {
  console.error(`\n${failures} token violation(s). Add a token in src/styles/tokens.css instead.`)
  process.exit(1)
}

// --- Shared looks are defined once (components/ui) and composed, never written again -------------------
// (a) The class sets a primitive owns (components/ui/styles.ts, and the few below) may not appear together
//     in one string anywhere else. (b) The same set of three or more visual classes (color, type, border,
//     radius, shadow, ground: not layout) may not be written in two or more files outside components/ui:
//     make it a primitive or a role in styles.ts.
const UI = 'components/ui/'
const styles = readFileSync(join(ROOT, 'components/ui/styles.ts'), 'utf8')
const OWNED = [
  ...[...styles.matchAll(/^\s+(\w+): '([^']+)',?$/gm)].map((m) => [`styles.ts ${m[1]}`, m[2]]),
  ...[...styles.matchAll(/^export const (\w+) = '([^']+)'$/gm)].map((m) => [`styles.ts ${m[1]}`, m[2]]),
  ['Label', 'flex flex-col gap-1.5 text-sm font-medium'],
  ['Divider', 'w-px bg-border'],
].map(([owner, classes]) => [owner, classes.split(/\s+/)])
const VISUAL =
  /^(?:[\w-]+:)*(?:text-(?!left|right|center|justify|wrap|nowrap|ellipsis|clip)|font-|tracking-|leading-|uppercase$|italic$|bg-|border|rounded|shadow|ring|outline|divide-|opacity-|underline|decoration-)/
// The spacing scale (app/AGENTS.md): gaps 0.5 (stacked lines), 1 (tight), 1.5 (icon and label), 2 (default),
// 3 (sections), 4 (page). Anything else is for components/ui alone.
const RETIRED_GAP = /^(?:[\w-]+:)*gap(?:-[xy])?-(?:2\.5|[5-9]|1[0-9]|px)$/
// Sets that may repeat, with why (keep this short).
const REPEAT_OK = new Set([])
const LITERAL = /'([^'\n]*)'|"([^"\n]*)"|`([^`$\n]*)`/g
const sets = new Map() // visual set -> files
let style = 0
for (const file of files) {
  const rel = relative(ROOT, file)
  if (rel.startsWith(UI) || ALLOWED.has(rel) || rel.endsWith('.gen.ts') || /\.test\.tsx?$/.test(rel)) continue
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(LITERAL)) {
    const classes = (m[1] ?? m[2] ?? m[3]).split(/\s+/).filter(Boolean)
    if (classes.length < 2 || !classes.every((c) => /^[\w:/.[\]()%-]+$/.test(c))) continue // not a class list
    for (const [owner, owned] of OWNED)
      if (owned.every((c) => classes.includes(c))) {
        const line = text.slice(0, m.index).split('\n').length
        console.error(`src/${rel}:${line}: "${owned.join(' ')}" is ${owner}: use it, not its classes`)
        style++
      }
    for (const c of classes)
      if (RETIRED_GAP.test(c)) {
        const line = text.slice(0, m.index).split('\n').length
        console.error(`src/${rel}:${line}: "${c}" is off the spacing scale (gap 0.5, 1, 1.5, 2, 3, 4)`)
        style++
      }
    const visual = [...new Set(classes.filter((c) => VISUAL.test(c)))].sort()
    if (visual.length >= 3) {
      const key = visual.join(' ')
      sets.set(key, new Set([...(sets.get(key) ?? []), rel]))
    }
  }
}
for (const [key, where] of sets)
  if (where.size >= 2 && !REPEAT_OK.has(key)) {
    console.error(`"${key}" written in ${where.size} files (${[...where].join(', ')}): make it a primitive or a role in components/ui/styles.ts`)
    style++
  }
if (style) {
  console.error(`\n${style} style violation(s): compose the shared looks of components/ui instead (app/AGENTS.md › Styling).`)
  process.exit(1)
}
