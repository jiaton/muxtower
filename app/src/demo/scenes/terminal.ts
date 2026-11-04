/** Screens drawn the way Claude Code and Codex draw theirs. Lines are kept as what they are (a paragraph,
 *  a rule, a box) and drawn at the pane's width when read, as an agent redraws when its pane is resized. */

/** The width of a pane nobody has sized yet: narrow enough for a phone. */
export const WIDTH = 46

const ESC = '\x1b'
const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')
type Paint = (text: string) => string
const sgr =
  (code: string): Paint =>
  (text) =>
    `${ESC}[${code}m${text}${ESC}[0m`
const same: Paint = (text) => text
/** The text without its colors. */
export const plain = (text: string) => text.replace(SGR, '')
const visible = (text: string) => plain(text).length
export const bold = sgr('1')
export const dim = sgr('2')
export const gray = sgr('90')
export const green = sgr('32')
export const red = sgr('31')
export const cyan = sgr('36')
export const orange = sgr('38;5;209')

/** One line as written (a string), or something drawn to the width: a paragraph broken into lines (the
 *  first after `first`, the rest after `rest`, the words painted), a rule across the pane, a rounded box around `rows`. */
export type Line =
  | string
  | { kind: 'wrap'; text: string; first: string; rest: string; paint: Paint }
  | { kind: 'rule'; paint: Paint }
  | { kind: 'box'; rows: string[]; paint: Paint; max: number }

export const para = (text: string, first = '', rest = '  ', paint = same): Line => ({ kind: 'wrap', text, first, rest, paint })
export const rule = (paint = same): Line => ({ kind: 'rule', paint })
export const box = (rows: string[], paint = same, max = Infinity): Line => ({ kind: 'box', rows, paint, max })

/** `text` broken into lines of at most `width` columns (colors do not count), each painted after its
 *  prefix. */
export function wrap(text: string, first: string, rest: string, width: number, paint = same): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.trim().split(' ')) {
    const prefix = lines.length ? rest : first
    if (line && visible(prefix) + visible(line) + 1 + visible(word) > width) {
      lines.push(prefix + paint(line))
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  lines.push((lines.length ? rest : first) + paint(line))
  return lines
}

/** The lines as a pane `width` columns wide shows them. */
export function render(lines: Line[], width: number): string[] {
  return lines.flatMap((line) => {
    if (typeof line === 'string') return [line]
    if (line.kind === 'wrap') return wrap(line.text, line.first, line.rest, width, line.paint)
    if (line.kind === 'rule') return [line.paint('─'.repeat(width))]
    const inner = Math.min(width, line.max) - 4
    const edge = line.paint('│')
    return [
      line.paint(`╭${'─'.repeat(inner + 2)}╮`),
      ...line.rows.map((row) => `${edge} ${row}${' '.repeat(Math.max(0, inner - visible(row)))} ${edge}`),
      line.paint(`╰${'─'.repeat(inner + 2)}╯`),
    ]
  })
}

// --- Claude Code ---------------------------------------------------------------------------------

export const claudeWelcome = (cwd: string): Line[] => [
  box([`${orange('✻')} Welcome to ${bold('Claude Code')}!`, '', gray(`  cwd: ${cwd}`)], orange, 58),
  '',
]
export const said = (text: string): Line[] => ['', para(text, `${gray('>')} `)]
export const answered = (text: string): Line[] => ['', para(text, '● ')]
/** A tool call that ran, and what it printed. */
export const ran = (text: string, ...result: string[]): Line[] => [
  ...call(text, green),
  ...result.map((line, i) => para(line, i ? '     ' : `  ${gray('⎿')}  `, '     ', gray)),
]
export const working = (verb: string, seconds: number): Line[] => [`${orange('✶')} ${orange(`${verb}…`)} ${gray(`(${seconds}s)`)}`]
export const claudeInput: Line[] = [box([gray('>')]), gray('  ? for shortcuts')]

/** A tool call: gray while it waits, green once it ran, red when it was refused. */
export const call = (text: string, paint = gray): Line[] => ['', para(text, `${paint('●')} `, '  ', bold)]

/** Claude Code's permission dialog for a shell command, under the call it is about. */
export const permission = (command: string, description: string, options: string[]): Line[] => [
  ...call(`Bash(${command})`),
  '',
  rule(),
  bold(' Bash command'),
  '',
  para(command, '   ', '   '),
  para(description, '   ', '   ', gray),
  '',
  ' Do you want to proceed?',
  ...options.map((label, i) => para(`${i + 1}. ${label}`, i ? '   ' : ` ${cyan('❯')} `, '      ')),
]

/** Claude Code's question dialog (AskUserQuestion). */
export const question = (header: string, ask: string, options: [string, string][]): Line[] => [
  rule(),
  ` ${cyan('☐')} ${bold(header)}`,
  '',
  para(ask, ' ', ' '),
  '',
  ...options.flatMap(([label, detail], i) => [`${i ? '  ' : ` ${cyan('❯')}`} ${i + 1}. ${label}`, para(detail, '      ', '      ', gray)]),
  '',
  para('Enter to select · ↑/↓ to navigate · Esc to cancel', ' ', ' ', gray),
]

// --- Codex -----------------------------------------------------------------------------------------

export const codexWelcome = (cwd: string): Line[] => [
  box(
    [`${bold('>_ OpenAI Codex')} ${gray('(v0.50.0)')}`, '', `${gray('model:')}     gpt-5-codex`, `${gray('directory:')} ${cwd}`],
    same,
    56,
  ),
  '',
]
export const codexSaid = (text: string): Line[] => ['', para(text, `${gray('›')} `)]
export const codexAnswered = (text: string): Line[] => ['', para(text, '• ')]
export const codexDid = (title: string, ...details: string[]): Line[] => [
  '',
  para(title, `${gray('•')} `, '  ', bold),
  ...details.map((line, i) => para(line, i ? '    ' : `  ${gray('└')} `, '    ', gray)),
]
export const codexWorking = (seconds: number): Line[] => [`${cyan('•')} ${bold('Working')} ${gray(`(${seconds}s)`)}`]
export const codexInput: Line[] = [
  '',
  `${bold('›')} ${gray('Ask Codex to do anything')}`,
  '',
  gray('  ⏎ send   ⇧⏎ newline   ⌃T transcript'),
]
