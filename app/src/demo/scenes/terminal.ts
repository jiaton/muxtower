/** Screens drawn the way Claude Code and Codex draw theirs, narrow enough for a phone. */

export const WIDTH = 46

const ESC = '\x1b'
const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')
const sgr = (code: string) => (text: string) => `${ESC}[${code}m${text}${ESC}[0m`
/** The text without its colors. */
export const plain = (text: string) => text.replace(SGR, '')
export const bold = sgr('1')
export const dim = sgr('2')
export const gray = sgr('90')
export const green = sgr('32')
export const red = sgr('31')
export const cyan = sgr('36')
export const orange = sgr('38;5;209')

/** `text` broken into lines of at most `width`, the first after `first`, the rest after `rest`. */
export function wrap(text: string, first = '', rest = '  ', width = WIDTH): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const prefix = lines.length ? rest : first
    if (line && prefix.length + line.length + 1 + word.length > width) {
      lines.push(prefix + line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  lines.push((lines.length ? rest : first) + line)
  return lines
}

/** A rounded box around `rows` (each padded to the width; ANSI codes do not count). */
export function box(rows: string[], width = WIDTH, paint = (s: string) => s): string[] {
  const visible = (s: string) => plain(s).length
  return [
    paint(`╭${'─'.repeat(width - 2)}╮`),
    ...rows.map((row) => `${paint('│')} ${row}${' '.repeat(Math.max(0, width - 4 - visible(row)))} ${paint('│')}`),
    paint(`╰${'─'.repeat(width - 2)}╯`),
  ]
}

// --- Claude Code ---------------------------------------------------------------------------------

export const claudeWelcome = (cwd: string) => [
  ...box([`${orange('✻')} Welcome to ${bold('Claude Code')}!`, '', gray(`  cwd: ${cwd}`)], WIDTH, orange),
  '',
]
export const said = (text: string) => ['', ...wrap(text, `${gray('>')} `)]
export const answered = (text: string) => ['', ...wrap(text, '● ')]
export const ran = (text: string, ...result: string[]) => [
  ...call(text, green),
  ...result.map((line, i) => gray(`  ${i ? ' ' : '⎿'}  ${line}`)),
]
export const working = (verb: string, seconds: number) => [`${orange('✶')} ${orange(`${verb}…`)} ${gray(`(${seconds}s)`)}`]
export const claudeInput = [...box([gray('>')]), gray('  ? for shortcuts')]

/** A tool call: gray while it waits, green once it ran, red when it was refused. */
export const call = (text: string, paint = gray) => ['', `${paint('●')} ${bold(text)}`]

/** Claude Code's permission dialog for a shell command, under the call it is about. */
export const permission = (command: string, description: string, options: string[]) => [
  ...call(`Bash(${command})`),
  '',
  `${'─'.repeat(WIDTH)}`,
  bold(' Bash command'),
  '',
  `   ${command}`,
  gray(`   ${description}`),
  '',
  ' Do you want to proceed?',
  ...options.flatMap((label, i) => wrap(`${i + 1}. ${label}`, i ? '   ' : ` ${cyan('❯')} `, '      ')),
]

/** Claude Code's question dialog (AskUserQuestion). */
export const question = (header: string, ask: string, options: [string, string][]) => [
  `${'─'.repeat(WIDTH)}`,
  ` ${cyan('☐')} ${bold(header)}`,
  '',
  ...wrap(ask, ' ', ' '),
  '',
  ...options.flatMap(([label, detail], i) => [
    `${i ? '  ' : ` ${cyan('❯')}`} ${i + 1}. ${label}`,
    ...wrap(detail, '      ', '      ').map(gray),
  ]),
  '',
  gray(' Enter to select · ↑/↓ to navigate · Esc to cancel'),
]

// --- Codex -----------------------------------------------------------------------------------------

export const codexWelcome = (cwd: string) => [
  ...box([`${bold('>_ OpenAI Codex')} ${gray('(v0.50.0)')}`, '', `${gray('model:')}     gpt-5-codex`, `${gray('directory:')} ${cwd}`]),
  '',
]
export const codexSaid = (text: string) => ['', ...wrap(text, `${gray('›')} `)]
export const codexAnswered = (text: string) => ['', ...wrap(text, '• ')]
export const codexDid = (title: string, ...details: string[]) => [
  '',
  `${gray('•')} ${bold(title)}`,
  ...details.map((line, i) => gray(`  ${i ? ' ' : '└'} ${line}`)),
]
export const codexWorking = (seconds: number) => [`${cyan('•')} ${bold('Working')} ${gray(`(${seconds}s)`)}`]
export const codexInput = ['', `${bold('›')} ${gray('Ask Codex to do anything')}`, '', gray('  ⏎ send   ⇧⏎ newline   ⌃T transcript')]
