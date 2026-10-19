// Display limits are tokens: raw display numbers live only in src/display/limits.ts, and the system menu
// stays within the firmware's limits (10 items, 32-byte names). Run by `npm run lint`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = new URL('../src', import.meta.url).pathname
const ALLOWED = new Set(['display/limits.ts'])
const RAW = /(?<![\w.])(576|288|999|990)(?![\w.])/
const problems = []

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })

for (const path of files(SRC)) {
  const rel = relative(SRC, path)
  if (!rel.endsWith('.ts') || rel.endsWith('.test.ts') || rel.endsWith('.d.ts') || ALLOWED.has(rel)) continue
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (RAW.test(line)) problems.push(`${rel}:${i + 1}: raw display number; use display/limits.ts`)
    })
}

const menu = readFileSync(join(SRC, 'screens/index.ts'), 'utf8')
const block = menu.slice(menu.indexOf('export const MENU'), menu.indexOf(']', menu.indexOf('export const MENU')))
const names = [...block.matchAll(/name: '([^']*)'/g)].map((m) => m[1])
if (names.length > 10) problems.push(`screens/index.ts: ${names.length} menu items (max 10)`)
for (const name of names)
  if (new TextEncoder().encode(name).length > 32) problems.push(`screens/index.ts: menu name "${name}" over 32 bytes`)

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
