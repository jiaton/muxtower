import type { CommandPack } from './types'

/** Mandarin. Speech to text mishears a one-word clip of it, as Pinyin or even another language ("Façam"
 *  for the send word): those near-misses are listed with each command. */
export const zh: CommandPack = {
  id: 'zh',
  name: '中文',
  say: { send: '发送', pause: '暂停', resume: '继续', clear: '清空', undo: '撤回上一句' },
  heard: {
    send: ['发送', '发松', '罚送', '法送', '发宋', '发诵', '花送', 'fa song', 'fasong', 'façam', 'fassão'],
    pause: ['暂停', '站停', '暂定', '战停', '赞停', 'zan ting', 'zanting'],
    resume: ['继续', '机续', '继序', 'ji xu', 'jixu'],
    clear: ['清空', '请空', '亲空', '清控', 'qing kong', 'qingkong'],
    undo: ['撤回上一句', '撤回', '撤回上一个', '车回', 'che hui'],
  },
  leads: ['那', '好', '好的', '那就'],
  fillers: ['嗯', '啊', '呃', '哦', '额'],
  trailingSend: ['发送'],
  joiners: ['然后', '再', '就'],
  unspaced: true,
  tokens: {
    send: [['f', 'ā', 's', 'òng']],
    pause: [['z', 'àn', 't', 'íng']],
    resume: [['j', 'ì', 'x', 'ù']],
    clear: [['q', 'īng', 'k', 'ōng']],
    undo: [['ch', 'è', 'h', 'uí', 'sh', 'àng', 'y', 'í', 'j', 'ù']],
  },
  decoys: [
    ['f', 'ā', 's', 'ōng'],
    ['f', 'ā', 'sh', 'āo'],
  ],
}
