import type { CommandPack } from './types'

export const en: CommandPack = {
  id: 'en',
  name: 'English',
  say: { send: 'send', pause: 'pause', resume: 'resume', clear: 'clear', undo: 'undo' },
  heard: {
    send: ['send', 'send it', 'sent', 'end', 'sand', 'sen'],
    pause: ['pause', 'paws', 'pose', 'pass'],
    resume: ['resume', 'continue'],
    clear: ['clear', 'clare', 'clea'],
    undo: ['undo', 'and do', 'undue'],
  },
  leads: ['then', 'and', 'ok', 'okay', 'so'],
  fillers: ['um', 'umm', 'uh', 'uhh', 'ah', 'oh'],
  trailingSend: ['send'],
  joiners: ['and then', 'and', 'then'],
  tokens: {
    send: [['S', 'EH1', 'N', 'D']],
    pause: [['P', 'AO1', 'Z']],
    resume: [
      ['R', 'IH0', 'Z', 'UW1', 'M'],
      ['R', 'IY0', 'Z', 'UW1', 'M'],
    ],
    clear: [['K', 'L', 'IH1', 'R']],
    undo: [
      ['AH0', 'N', 'D', 'UW1'],
      ['AH1', 'N', 'D', 'UW1'],
    ],
  },
  decoys: [
    ['S', 'P', 'EH1', 'N', 'D'],
    ['S', 'AE1', 'N', 'D'],
    ['S', 'EH1', 'N', 'T'],
    ['S', 'P', 'EH1', 'N', 'T'],
    ['EH1', 'N', 'D'],
  ],
}
