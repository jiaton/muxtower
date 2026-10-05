// Enforces app/AGENTS.md token discipline: no raw colors or palette/arbitrary Tailwind values
// outside src/styles/tokens.css.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('../src', import.meta.url).pathname
const ALLOWED = new Set(['styles/tokens.css', 'lib/api/schema.d.ts'])
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white'
const RULES = [
  [/#[0-9a-fA-F]{3,8}\b/, 'raw hex color'],
  [/\b(?:rgba?|hsla?|oklch)\(/, 'raw color function'],
  [new RegExp(`\\b[a-z-]+-(?:${PALETTE})(?:-\\d{2,3})?\\b`), 'Tailwind palette class'],
  [/\b[a-z-]+-\[[^\]]+\]/, 'arbitrary Tailwind value'],
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
  if (ALLOWED.has(rel) || rel.endsWith('.gen.ts')) continue
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
