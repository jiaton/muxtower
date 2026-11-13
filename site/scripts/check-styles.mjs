// Enforces site/AGENTS.md › Styling, as app/scripts/check-styles.mjs does for the app: sections and the demo
// say what a thing is, never how it looks. Outside src/components/ui: (1) no class string (className, class,
// class:list) holds a visual class; (2) gap, padding and margin stay on the site's spacing scale; (3) no
// native control (<button>, <input>, <select>, <textarea>, a styled <a>); (4) nothing imports how looks are
// built (the app's components/ui/styles): the site's intents (`ink`, `look`, `device`, components/ui/intents)
// and the app's (`@app/components/ui/intents`, for the drawn app) say it; (5) an element takes at most one
// text intent and one box intent (`ink.count` may join), whichever branch applies; (6) a components/ui
// component with a look of its own takes no intent: give it a variant.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('../src', import.meta.url).pathname
const APP_INTENTS = new URL('../../app/src/components/ui/intents.ts', import.meta.url).pathname
const VISUAL =
  /^(?:[\w-]+:)*-?(?:text-(?!left$|right$|center$|justify$|start$|end$|wrap$|nowrap$|ellipsis$|clip$|balance$|pretty$)|font-|tracking-|leading-|uppercase$|lowercase$|capitalize$|italic$|tabular-nums$|bg-|border|divide-|rounded|shadow|ring|outline|opacity-|underline|decoration-|line-through$|no-underline$|animate-|transition|duration-|antialiased$|placeholder:|fill-|stroke-|from-|via-|to-|blur|backdrop-|drop-shadow|mask-)/
// The app's scale for what the demo draws, and a few larger steps for the page's own rhythm (sections, the hero).
const DETAIL = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '4']
const PAGE = ['5', '6', '7', '8', '10', '12', '14', '16', '20', '28']
const GAP = new Set([...DETAIL, ...PAGE])
const PAD = new Set([...DETAIL, ...PAGE])
const MARGIN = new Set([...DETAIL, ...PAGE, 'px', 'auto']) // px: a hairline (a caret after the text)
const CLASSY = /^[\w:/.[\]()%&!*@-]+$/ // what a class looks like
// A template literal is read with its ${…} parts taken out: what is written around them is classes too.
const LITERAL = /(\b[\w:-]+=)?(?:'([^'\n]*)'|"([^"\n]*)"|`((?:[^`\\$]|\$(?!\{)|\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*)`)/g
const CLASS_ATTR = new Set(['className=', 'class='])

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.(tsx?|astro)$/.test(name)) files.push(path)
  }
}
walk(ROOT)
const checked = files
  .map((file) => ({ file, rel: relative(ROOT, file) }))
  .filter(({ rel }) => !rel.startsWith('components/ui/') && !/\.test\.tsx?$/.test(rel))

let failures = 0
const fail = (rel, text, index, what) => {
  console.error(`src/${rel}:${text.slice(0, index).split('\n').length}: ${what}`)
  failures++
}
for (const { file, rel } of checked) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(LITERAL)) {
    const attr = m[1]
    if (attr && !CLASS_ATTR.has(attr)) continue // another attribute's value (variant="outline"), not classes
    const tokens = (m[2] ?? m[3] ?? (m[4] ?? '').replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ' ')).split(/\s+/).filter(Boolean)
    if (!tokens.length || !tokens.every((t) => CLASSY.test(t))) continue
    if (tokens.length === 1 && !tokens[0].includes('-') && !CLASS_ATTR.has(attr)) continue // a bare word, not surely a class
    for (const t of tokens) {
      const bare = t.replace(/^(?:[\w-]+:)*/, '')
      if (VISUAL.test(t)) fail(rel, text, m.index, `"${t}" is a look: use an intent, a variant or a component of components/ui`)
      const step = bare.match(/^-?(gap(?:-[xy])?|p[xytrbl]?|m[xytrbl]?)-(.+)$/)
      if (!step) continue
      const [, kind, value] = step
      const scale = kind.startsWith('gap') ? GAP : kind.startsWith('p') ? PAD : MARGIN
      if (bare.startsWith('-') || !scale.has(value)) fail(rel, text, m.index, `"${t}" is off the spacing scale`)
    }
  }
  if (/\.(tsx|astro)$/.test(rel))
    for (const m of text.matchAll(/<(button|input|select|textarea)\b|<a\b(?=[^>]*\bclass(?:Name)?=)/g))
      fail(rel, text, m.index, `<${m[1] ?? 'a'}>: use the components/ui control (Button, or Button asChild around a link)`)
}
// --- intents ---------------------------------------------------------------------------------------------
const functionsOf = (path) => [...readFileSync(path, 'utf8').matchAll(/^export const (\w+) = \(/gm)].map((m) => m[1])
const INTENT_FUNCTIONS = [...functionsOf(join(ROOT, 'components/ui/intents.ts')), ...functionsOf(APP_INTENTS)]
const LOOK = new RegExp(`\\b(?:look|appLook|device)\\.\\w+(?:\\.\\w+)?|\\b(?:${INTENT_FUNCTIONS.join('|')})\\(`, 'g')
const INK = /\b(?:ink|appInk|stateInk)\.(\w+)/g

/** Splits at top-level occurrences of `sep` (outside brackets, strings and templates). */
function splitTop(expr, sep) {
  const parts = []
  let depth = 0,
    quote = null,
    start = 0
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    else if (depth === 0 && expr.startsWith(sep, i)) {
      parts.push(expr.slice(start, i))
      start = i + sep.length
      i += sep.length - 1
    }
  }
  parts.push(expr.slice(start))
  return parts
}
const sum = (x, y) => ({ look: x.look + y.look, ink: x.ink + y.ink })
/** How many looks and inks an element gets at once from a class expression: alternatives (`a ? b : c`,
 *  `a || b`) count their largest, `a && b` its right side, `cn(...)`, lists and templates their parts together. */
function applied(expr) {
  expr = expr.trim()
  const q = splitTop(expr, '?')
  if (q.length > 1) {
    const [yes, no] = splitTop(q.slice(1).join('?'), ':')
    const a = applied(yes),
      b = applied(no ?? '')
    return { look: Math.max(a.look, b.look), ink: Math.max(a.ink, b.ink) }
  }
  const or = splitTop(expr, '||')
  if (or.length > 1) return or.map(applied).reduce((x, y) => ({ look: Math.max(x.look, y.look), ink: Math.max(x.ink, y.ink) }))
  const and = splitTop(expr, '&&')
  if (and.length > 1) return applied(and.at(-1))
  const call = expr.match(/^cn\(([\s\S]*)\)$/) ?? expr.match(/^\[([\s\S]*)\]$/)
  if (call) return splitTop(call[1], ',').map(applied).reduce(sum, { look: 0, ink: 0 })
  if (expr.startsWith('`') && expr.endsWith('`'))
    return [...expr.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)].map((m) => applied(m[1])).reduce(sum, { look: 0, ink: 0 })
  return { look: (expr.match(LOOK) ?? []).length, ink: [...expr.matchAll(INK)].filter((m) => m[1] !== 'count').length }
}
/** Each element's name, its class expression and its other attributes, roughly. */
function* elements(text) {
  for (const m of text.matchAll(/<([A-Z][\w.]*|[a-z][\w.-]*)\b([^<>]*?)(?:className|class:list|class)=\{/g)) {
    let depth = 1,
      i = m.index + m[0].length
    for (; i < text.length && depth; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') depth--
    }
    const rest = text.slice(i, text.indexOf('>', i) + 1)
    yield { name: m[1], expr: text.slice(m.index + m[0].length, i - 1), attrs: m[2] + rest, index: m.index }
  }
}
for (const { file, rel } of checked) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/from '[^']*components\/ui\/styles'/g))
    fail(rel, text, m.index, 'imports how looks are built: use the intents (`ink`, `look`, `device`) and components')
  if (!/\.(tsx|astro)$/.test(rel)) continue
  const fromUi = new Set(
    [...text.matchAll(/import \{([^}]*)\} from '@\/components\/ui\/(?!intents)[^']*'/g)].flatMap((m) =>
      m[1].split(',').map((x) => x.trim().split(' as ').pop()),
    ),
  )
  for (const el of elements(text)) {
    const { look, ink } = applied(el.expr)
    if (look > 1) fail(rel, text, el.index, `<${el.name}> takes ${look} box intents at once: name the combination as one intent`)
    if (ink > 1) fail(rel, text, el.index, `<${el.name}> takes ${ink} text intents at once: name the combination as one intent`)
    if (fromUi.has(el.name) && (look || ink))
      fail(rel, text, el.index, `<${el.name}> has a look of its own: give it a variant, not an intent`)
  }
}

if (failures) {
  console.error(`\n${failures} styling violation(s): sections say what a thing is, never how it looks (site/AGENTS.md › Styling).`)
  process.exit(1)
}
