import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createApplicationDataEventFilter } from '../../src/main/ipc/workspace-event-filter'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'janusx-data-filter-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('application data event boundaries', () => {
  it('filters only the actual application trees and keeps source, Git, lookalike and unknown events', () => {
    const filter = createApplicationDataEventFilter(root, [join(root, 'release', 'data'), join(root, '.cache', 'session')])
    expect(filter('release/data/usage.sqlite-wal')).toBe(true)
    expect(filter(Buffer.from('release/data'))).toBe(true)
    expect(filter('.cache/session/Cache/x')).toBe(true)
    for (const path of ['data/user.json', 'release/database/file', 'release/data-copy/file', '.git/HEAD', 'src/main.ts', null, '']) {
      expect(filter(path)).toBe(false)
    }
  })

  it('does not suppress an entire workspace when an application path is its ancestor or outside it', () => {
    const filter = createApplicationDataEventFilter(join(root, 'workspace'), [root, join(root, 'other-profile')])
    expect(filter('data/test.json')).toBe(false)
    expect(filter('src/test.ts')).toBe(false)
  })

  it('recognizes a workspace opened through a directory alias', async () => {
    const actual = join(root, 'actual')
    const alias = join(root, 'alias')
    await mkdir(join(actual, 'profile'), { recursive: true })
    await symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const filter = createApplicationDataEventFilter(alias, [join(actual, 'profile')])
    expect(filter('profile/usage.sqlite')).toBe(true)
    expect(filter('profile-other/source.ts')).toBe(false)
  })
})
