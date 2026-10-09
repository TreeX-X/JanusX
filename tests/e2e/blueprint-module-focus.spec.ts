import { expect, test, type Page } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node'
import type { ChatTurnPorts } from '@janus-agent/janus-agent'
import { attachNoteChatTools } from '../../src/main/harness/note-chat'
import type { NoteFocusEvent } from '../../src/shared/note-chat'

const repo = '11111111-1111-4111-8111-111111111111'
const ids = { root: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reader: '66666666-6666-4666-8666-666666666666', planned: '77777777-7777-4777-8777-777777777777', parser: '00000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', deep: '00000005-aaaa-4aaa-8aaa-aaaaaaaaaaaa', rootDoc: '00000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', child: '00000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
const uri = (key: keyof typeof ids) => `note://${repo}/${ids[key]}`
const card = (page: Page, title: string) => page.locator('.react-flow__node').filter({ has: page.locator('.bp-node-card__title', { hasText: new RegExp(`^${title}$`) }) })
const nav = (page: Page) => page.getByRole('navigation', { name: '模块导航' })
const panel = (page: Page) => page.locator('.bp-maintenance-panel')
const current = (page: Page) => nav(page).locator('[aria-current="page"]')
const viewport = (page: Page) => page.locator('.react-flow__viewport').getAttribute('style')

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'module-focus-'))
  await mkdir(join(root, '.agents/notes'), { recursive: true })
  await writeFile(join(root, '.agents/harness.json'), JSON.stringify({ schemaVersion: 1, repoId: repo, name: 'Architecture', profile: SUPPORTED_HARNESS_PROFILE }))
  for (const [key, title, kind, owner] of [
    ['root', 'Workbench architecture', 'module', null], ['reader', 'Reader module', 'module', 'root'],
    ['planned', 'Planned module', 'module', 'root'], ['parser', 'Parser submodule', 'module', 'reader'],
    ['deep', 'Deep parsing document', 'note', 'parser'], ['rootDoc', 'Root decision', 'note', 'root'], ['child', 'Child note', 'note', 'reader'],
  ] as const) {
    const meta = { schema: 'harness-note/2', id: ids[key], kind, lifecycle: 'accepted', created: '2026-10-08', updated: '2026-10-08T00:00:00Z',
      ...(kind === 'module' ? { moduleState: key === 'planned' ? 'planned' : 'partial', ...(owner ? { parent: uri(owner) } : { role: 'project' }) } : { module: uri(owner!) }) }
    const file = join(root, '.agents/notes', { root: 'module.md', reader: 'reader/module.md', planned: 'planned/module.md', parser: 'reader/parser/module.md', deep: 'reader/parser/deep.md', rootDoc: 'root.md', child: 'reader/child.md' }[key])
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, `---\n${JSON.stringify(meta)}\n---\n# ${title}\n\n## Design\n\nSource for ${title}.\n`)
  }
  return root
}

// Real host tool validation/read service; only the Electron transport is replaced.
async function invoke(page: Page, root: string, toolName: string, args: Record<string, unknown>) {
  const request = await page.evaluate(() => (window as any).architectureFixture.streams.at(-1))
  const focus: NoteFocusEvent[] = []
  const resource = request.workspaceResources[0]
  const ports = { sessions: { getSession: () => ({ sessionId: resource.agentSessionId, workspaceId: resource.workspaceId, workspaceRoot: root, status: 'running' }) },
    tools: { registry: { list: () => [] }, executeFunctionCall: async () => { throw new Error('Unexpected tool') } } } as unknown as ChatTurnPorts
  attachNoteChatTools(ports, { conversationId: request.conversationId, userText: request.messages.at(-1).content, signal: new AbortController().signal,
    resources: [resource], onChange: () => { throw new Error('Unexpected write') }, onFocus: event => focus.push(event) })
  const result = await ports.tools.executeFunctionCall({ sessionId: resource.agentSessionId, call: { toolName, input: args } } as never, 'test')
  for (const event of focus) await page.evaluate(event => (window as any).architectureFixture.deliver(event), event)
  return result
}
const targets = (...keys: Array<keyof typeof ids>) => keys.map((key, i) => ({ uri: uri(key), role: i ? 'reference' : 'target', reason: `Relevant ${key}` }))

for (const surface of ['', '&workbench']) test(`real Note tools navigate modules and keep scope, context and history separate ${surface}`, async ({ page }) => {
  const root = await fixture(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto('/blueprint-architecture.html?v2&focus&cwd=' + encodeURIComponent(root) + surface)
    expect(errors).toEqual([])
    await expect(current(page)).toHaveText('Workbench architecture')
    await panel(page).locator('textarea').fill('请查看、预览、进入和定位相关模块与文档')
    await panel(page).locator('textarea').press('Enter')
    await expect(panel(page)).toContainText('Module navigation reply')
    await card(page, 'Reader module').click()
    await expect(page.locator('.bp-node-detail__title')).toHaveText('Reader module')
    const before = await viewport(page)
    const scopeResult = await invoke(page, root, 'note.scope', { reason: 'Cross-module work', focus: 'explicit', notes: targets('deep', 'rootDoc', 'reader') })
    expect(scopeResult.output).toMatchObject({ navigation: 'not-requested' })
    await expect(current(page)).toHaveText('Workbench architecture')
    expect(await viewport(page)).toBe(before)
    const scope = panel(page).locator('.bp-note-scope')
    await scope.locator('details > summary').click()
    await expect(scope.locator('.bp-note-group')).toHaveCount(2)
    await expect(scope).toContainText('Workbench architecture / Reader module / Parser submodule')
    await expect(scope).toContainText('其他模块')
    await scope.getByRole('button', { name: '固定 Deep parsing document', exact: true }).click()
    await scope.getByRole('button', { name: '移除 Root decision', exact: true }).click()
    await invoke(page, root, 'note.scope', { reason: 'Update working Notes', notes: targets('rootDoc', 'reader') })
    await expect(scope.getByRole('button', { name: 'Deep parsing document', exact: true })).toBeVisible()
    await expect(scope.getByRole('button', { name: 'Root decision', exact: true })).toHaveCount(0)
    const stableScope = await page.evaluate(() => (window as any).architectureFixture.scope())
    const preview = await invoke(page, root, 'note.focus', { reason: 'Read module', action: 'preview', notes: targets('reader') })
    expect(preview.output).toMatchObject({ status: 'validated', action: 'preview', navigation: 'requested' })
    await expect(current(page)).toHaveText('Workbench architecture')
    expect(await viewport(page)).toBe(before)
    await invoke(page, root, 'note.focus', { reason: 'Enter module', action: 'enter', notes: targets('reader') })
    await expect(current(page)).toHaveText('Reader module')
    await expect(page.locator('.react-flow__node')).toHaveCount(7)
    await invoke(page, root, 'note.read', { uri: uri('deep') })
    await expect(current(page)).toHaveText('Reader module')
    await expect(page.locator('.bp-node-detail__title')).toHaveText('Reader module')
    await invoke(page, root, 'note.focus', { reason: 'Locate nested document', action: 'locate', notes: targets('deep', 'rootDoc') })
    await expect(current(page)).toHaveText('Parser submodule')
    await expect(page.locator('.bp-node-detail__title')).toHaveText('Deep parsing document')
    await expect(card(page, 'Parser submodule')).toBeInViewport({ ratio: .999 })
    await expect(card(page, 'Deep parsing document')).toBeInViewport({ ratio: .999 })
    expect(await page.evaluate(() => (window as any).architectureFixture.scope())).toEqual(stableScope)
    await nav(page).getByRole('button', { name: '返回', exact: true }).click()
    await expect(current(page)).toHaveText('Reader module')
    await expect(page.locator('.bp-node-detail__title')).toHaveText('Reader module')
    await scope.getByRole('button', { name: 'Deep parsing document', exact: true }).click()
    await expect(current(page)).toHaveText('Parser submodule')
    await panel(page).locator('.bp-note-access summary').click()
    await panel(page).locator('.bp-note-access').getByRole('button', { name: 'Root decision', exact: true }).click()
    await expect(current(page)).toHaveText('Workbench architecture')
    await invoke(page, root, 'note.focus', { reason: 'Open planned module', action: 'enter', notes: targets('planned') })
    await expect(current(page)).toHaveText('Planned module')
    await expect(page.locator('.bp-browser-empty')).toBeVisible()
    const invalid = await invoke(page, root, 'note.focus', { reason: 'Invalid entry', action: 'enter', notes: targets('deep') })
    expect(invalid.status).toBe('failed')
    await expect(current(page)).toHaveText('Planned module')
    await invoke(page, root, 'note.focus', { reason: 'Open document', action: 'locate', notes: targets('child') })
    await expect(current(page)).toHaveText('Reader module')
    await expect(page.locator('.bp-node-detail__title')).toHaveText('Child note')
    await page.evaluate(() => (window as any).architectureFixture.finish())
    await panel(page).locator('textarea').fill('讨论当前模块的其他文档')
    await panel(page).locator('textarea').press('Enter')
    await expect.poll(() => page.evaluate(() => (window as any).architectureFixture.streams.length)).toBe(2)
    const request = await page.evaluate(() => (window as any).architectureFixture.streams.at(-1))
    const context = JSON.parse(request.noteWorkingSet)
    expect(context.browsing.currentModule.uri).toBe(uri('reader'))
    expect(context.browsing.modulePath.map((item: any) => item.uri)).toEqual([uri('root'), uri('reader')])
    expect(context.browsing.selected.uri).toBe(uri('child'))
    expect(context.workingSet.notes.map((item: any) => item.uri)).toEqual([uri('deep'), uri('reader')])
    expect(request.noteRefs.map((item: any) => item.uri)).toEqual(expect.arrayContaining([uri('reader'), uri('child'), uri('parser')]))
    await page.screenshot({ path: test.info().outputPath('module-focus.png'), fullPage: true, animations: 'disabled' })
    expect(errors).toEqual([])
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3 }) }
})
