import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createDesktopTestEnv } from './desktop-test-env'

test('built desktop persists memo edits and exposes typed change events without a workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'janus-memo-desktop-'))
  const buildRoot = resolve('out')
  const launch = () => electron.launch({ args: [join(buildRoot, 'main/index.js'), `--user-data-dir=${join(root, 'user-data')}`], env: { ...createDesktopTestEnv(root), JANUSX_DEV_BUILD_ROOT: buildRoot } })
  let application = await launch()
  try {
    const page = await application.firstWindow({ timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.electron?.memo))
    const result = await page.evaluate(async () => {
      const api = window.electron.memo!
      const changes: Array<{ id: string; revision: number | null }> = []
      const unsubscribe = api.onChanged(change => changes.push(change))
      const created = await api.create('Desktop memo')
      const node = await api.edit(created.id, { expectedRevision: 0, operations: [{ op: 'addNode', title: 'First', label: 'v1.0' }] })
      const edited = await api.edit(created.id, { expectedRevision: node.revision, operations: [{ op: 'addPoint', nodeId: node.nodes[0].id, text: 'A persistent idea' }] })
      const listed = await api.list()
      await new Promise(resolve => setTimeout(resolve, 50))
      unsubscribe()
      return { created, edited, listed, changes }
    })
    expect(result.listed[0]).toEqual(result.edited)
    expect(result.edited.nodes[0].label).toBe('v1.0')
    expect(result.edited).not.toHaveProperty('workspaces')
    expect(result.changes).toContainEqual({ id: result.created.id, revision: 2 })
    expect(result.edited.version).toBe(3)
    expect(result.edited).not.toHaveProperty('unassigned')
    const userData = await application.evaluate(({ app }) => app.getPath('userData'))
    expect(JSON.parse(await readFile(join(userData, 'janusx', 'memos', `${result.created.id}.json`), 'utf8'))).toEqual(result.edited)
    await application.close()
    application = await launch()
    const restoredPage = await application.firstWindow({ timeout: 30000 })
    await restoredPage.waitForFunction(() => Boolean(window.electron?.memo))
    expect(await restoredPage.evaluate(() => window.electron.memo!.list())).toEqual([result.edited])
    await restoredPage.evaluate(async id => { await window.electron.memo!.remove(id, 2) }, result.created.id)
    expect(await restoredPage.evaluate(() => window.electron.memo!.list())).toEqual([])
  } finally {
    await application.close()
    await rm(root, { recursive: true, force: true })
  }
})
