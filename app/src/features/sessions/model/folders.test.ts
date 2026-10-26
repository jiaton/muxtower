import { describe, expect, it } from 'vitest'
import { foldersAround, nestFolders } from './folders'

const shape = (items: { label: string; count: number }[], last?: string) =>
  nestFolders(items, last).map((n) => [n.item.label, n.depth, n.name, n.total])

describe('nestFolders', () => {
  it('puts a folder under the listed folder it lies in, named by the part below it', () => {
    const folders = [
      { label: '~/projects', count: 7 },
      { label: '~/projects/muxtower', count: 1 },
      { label: '~/projects/home', count: 1 },
      { label: '~/projects/home/web/app', count: 2 }, // its nearest listed folder is ~/projects/home
      { label: '~/work', count: 3 },
      { label: 'Unknown folder', count: 1 },
    ]
    expect(shape(folders, 'Unknown folder')).toEqual([
      ['~/projects', 0, '~/projects', 11],
      ['~/projects/home', 1, 'home', 3],
      ['~/projects/home/web/app', 2, 'web/app', 2],
      ['~/projects/muxtower', 1, 'muxtower', 1],
      ['~/work', 0, '~/work', 3],
      ['Unknown folder', 0, 'Unknown folder', 1],
    ])
  })

  it('makes up no parent, and tells a folder from one that merely starts the same', () => {
    expect(shape([{ label: '~/projects/a', count: 1 }, { label: '~/projects/b', count: 2 }, { label: '~/proj', count: 1 }])).toEqual([
      ['~/projects/b', 0, '~/projects/b', 2],
      ['~/proj', 0, '~/proj', 1],
      ['~/projects/a', 0, '~/projects/a', 1],
    ])
  })
})

describe('foldersAround', () => {
  it('names the listed folders a folder lies in, the closest first', () => {
    const listed = ['~/Documents/plans', '~/Documents', '~/Documents/plans-old', '~/code']
    expect(foldersAround('~/Documents/plans/drafts/launch', listed)).toEqual(['~/Documents/plans', '~/Documents'])
    expect(foldersAround('~/code', listed)).toEqual([])
  })
})
