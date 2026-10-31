// The app's token discipline (app/AGENTS.md), for the site: no raw colors or palette/arbitrary visual
// Tailwind values outside the token files. Colors themselves come from app/src/styles/tokens.css.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('../src', import.meta.url).pathname
// site.css holds the site's own tokens; icons.tsx draws a mark in currentColor.
const ALLOWED = new Set(['styles/site.css'])
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white'
const RULES = [
  [/#[0-9a-fA-F]{3,8}\b/, 'raw hex color'],
  [/\b(?:rgba?|hsla?|oklch)\(/, 'raw color function'],
  [new RegExp(`\\b[a-z-]+-(?:${PALETTE})(?:-\\d{2,3})?\\b`), 'Tailwind palette class'],
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
  if (ALLOWED.has(rel)) continue
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
  console.error(`\n${failures} token violation(s). Use the app's tokens, or add one in src/styles/site.css.`)
  process.exit(1)
}
