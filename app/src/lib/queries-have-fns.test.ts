import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// A query observed without a queryFn (to read another's data) warns "No queryFn was passed" each time that
// key is refetched: read the data through the hook that owns the query instead.
it('every useQuery names its queryFn', () => {
  const root = join(__dirname, '..')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path)
    }
  }
  walk(root)
  const fetchless = files.flatMap((file) => {
    const text = readFileSync(file, 'utf8')
    return [...text.matchAll(/useQuery\(\{([^{}]*)\}\)/g)].filter((m) => !m[1]!.includes('queryFn')).map(() => file)
  })
  expect(fetchless).toEqual([])
})
