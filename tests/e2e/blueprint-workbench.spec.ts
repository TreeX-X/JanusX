import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const rootId = '44444444-4444-4333-8333-444444444444'
const childId = '55555555-5555-4555-8555-555555555555'
const siblingId = '88888888-8888-4888-8888-888888888888'
const repoId = '8fa19f17-c717-43a8-93a7-810a5e0cbc91'
const detail = (page: Page) => page.locator('.blueprint-workbench-detail-slot')
const chat = (page: Page) => page.locator('.blueprint-workbench-janus-slot')
const toolbar = (page: Page) => page.locator('.blueprint-workbench-toolbar')
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const positions = (page: Page) => page.locator('.react-flow__node').evaluateAll(elements => Object.fromEntries(elements.map(element => {
  const matrix = new DOMMatrix(getComputedStyle(element).transform)
  return [element.getAttribute('data-id')!, { x: matrix.m41, y: matrix.m42 }]
})))

async function rect(locator: Locator) {
  await expect(locator).toBeVisible()
  return (await locator.boundingBox())!
}

async function insideViewport(page: Page, locator: Locator) {
  const viewport = page.viewportSize()!
  await expect.poll(async () => {
    const bounds = await locator.boundingBox()
    return !!bounds && bounds.x >= 0 && bounds.y >= 0
      && bounds.x + bounds.width <= viewport.width + 1
      && bounds.y + bounds.height <= viewport.height + 1
  }).toBe(true)
  const bounds = await rect(locator)
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
}

async function open(page: Page, query = '?workbench') {
  await page.goto('/project.html' + query)
  await expect(detail(page).locator('.markdown-preview')).toContainText('Root Note body from the authorized checkout.')
  await expect(page.locator('.react-flow__node')).toHaveCount(5)
  await expect(chat(page).locator('.janus-chat textarea')).toBeVisible()
  // Wait for the production entrance animations rather than changing their CSS.
  await expect.poll(() => page.locator('.blueprint-workbench-shell').evaluate(element =>
    element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity && animation.playState === 'running').length,
  )).toBe(0)
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test.describe(`${viewport.width}x${viewport.height} current-source Workbench`, () => {
    test.use({ viewport })
    test.beforeEach(async ({ page }) => {
      // No provider or network service may escape the mocked IPC boundary.
      await page.route('**/*', route => {
        const url = new URL(route.request().url())
        return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort('blockedbyclient')
      })
    })
    // Note: the canvas is inspection-only; writing and dispatching both live in
    // the Janus panel — see .agents/notes/blueprint/blueprint-dispatch-panel.md
    test('the canvas carries no work, terminal or dispatch control', async ({ page }) => {
      await open(page)
      await node(page, childId).click()
      const nodeDetail = page.locator('.bp-node-detail')
      await expect(nodeDetail).toBeVisible()
      for (const label of ['Start Work', 'Open Terminal', 'Copy implement prompt', 'Maintain Node']) {
        await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0)
      }
      await expect(toolbar(page).getByRole('button', { name: 'Edit in chat', exact: true })).toHaveCount(0)
      // The terminal row survives as read-only state with no control of its own.
      const terminalRow = nodeDetail.locator('.bp-node-detail__terminal-footer')
      await expect(terminalRow).toBeVisible()
      await expect(terminalRow.getByRole('button')).toHaveCount(0)
      await expect(chat(page).locator('.bp-maintenance-policy-hint')).toHaveCount(0)
      await expect(chat(page).getByRole('toolbar')).toHaveCount(0)
      // Nothing is expanded until a decision demands it.
      await expect(chat(page).locator('.bp-maintenance-approval')).toHaveCount(0)
    })

    test('two compact bars and three ordered panels keep the composer in the viewport', async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await open(page)
      const shell = page.locator('.blueprint-workbench-shell')
      await expect(shell.locator(':scope > header, :scope > [role=toolbar]')).toHaveCount(2)
      await expect(page.locator('.blueprint-workbench-body .blueprint-toolbar')).toHaveCount(0)
      const top = await rect(page.locator('.blueprint-workbench-topbar'))
      const bar = await rect(toolbar(page))
      const body = await rect(page.locator('.blueprint-workbench-body'))
      expect(top.height).toBeLessThanOrEqual(52)
      expect(bar.height).toBeLessThanOrEqual(52)
      expect(top.y + top.height).toBeLessThanOrEqual(bar.y + 1)
      expect(bar.y + bar.height).toBeLessThanOrEqual(body.y + 1)
      const left = await rect(detail(page))
      const center = await rect(page.locator('.blueprint-workbench-card--canvas'))
      const right = await rect(chat(page))
      expect(left.x + left.width).toBeLessThanOrEqual(center.x + 1)
      expect(center.x + center.width).toBeLessThanOrEqual(right.x + 1)
      for (const bounds of [left, center, right]) {
        expect(bounds.width).toBeGreaterThan(200)
        expect(bounds.y).toBeGreaterThanOrEqual(body.y - 1)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
      }
      await expect(detail(page).getByText('Root Note body from the authorized checkout.', { exact: true })).toBeInViewport()
      await insideViewport(page, chat(page).locator('.janus-chat textarea'))
      await expect(chat(page).locator('.bp-maintenance-controls')).toHaveCount(0)
      await expect(chat(page).locator('.bp-maintenance-context')).toHaveCount(0)
      await expect(chat(page).locator('.bp-maintenance-policy-hint')).toHaveCount(0)
      const bodyScroll = await chat(page).locator('.janus-chat-messages').evaluate(element => getComputedStyle(element).overflowY)
      expect(['auto', 'scroll']).toContain(bodyScroll)
      expect(errors).toEqual([])
    })

    test('selection, detail restore and real controller send survive panel collapse', async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await open(page)
      await node(page, childId).click()
      await expect(detail(page).locator('.markdown-preview')).toContainText('Child Note body with independent acceptance evidence.')
      await expect.poll(() => page.evaluate(() => (window as any).workbenchFixture.reads.at(-1))).toEqual({ cwd: 'C:/fixture', uri: `note://${repoId}/${childId}` })
      await detail(page).getByRole('button', { name: '关闭节点详情', exact: true }).click()
      await expect(detail(page)).toHaveAttribute('data-open', 'false')
      // A normal rerender must not reopen a deliberately closed detail pane.
      await toolbar(page).locator('input').fill('Implement')
      await toolbar(page).locator('input').clear()
      await expect(detail(page)).toHaveAttribute('data-open', 'false')
      await toolbar(page).getByRole('button', { name: '节点详情', exact: true }).click()
      await expect(detail(page)).toHaveAttribute('data-open', 'true')
      await expect(detail(page).locator('.markdown-preview')).toContainText('Child Note body with independent acceptance evidence.')
      const input = chat(page).locator('.janus-chat textarea')
      await insideViewport(page, input)
      await input.fill('Inspect this child Note')
      await input.press('Enter')
      await expect(chat(page)).toContainText('Project reply in progress')
      const request = await page.evaluate(() => (window as any).projectFixture.streams.at(-1))
      expect(request).toMatchObject({ domain: 'project', workspaceResources: [{ workspaceId: 'ws', workspacePath: 'C:/fixture' }] })
      expect(request.noteRefs).toEqual([{ uri: `note://${repoId}/${childId}`, expectedHash: 'a'.repeat(64), checkoutPath: 'C:/fixture' }])
      expect(await page.evaluate(() => (window as any).projectFixture.runtimeSessions[0].approvalMode)).toBe('plan')
      await page.evaluate(() => (window as any).projectFixture.finishStream())
      await chat(page).locator('.bp-maintenance-panel__header .bp-panel-close').click()
      await expect(page.locator('.blueprint-workbench-body')).toHaveAttribute('data-janus-open', 'false')
      await expect(chat(page)).toHaveCount(0)
      await page.locator('.blueprint-janus-capsule').click()
      await expect(page.locator('.blueprint-workbench-body')).toHaveAttribute('data-janus-open', 'true')
      await expect(chat(page)).toContainText('Project reply in progress')
      await insideViewport(page, input)
      expect(errors).toEqual([])
    })

    test('confirmed reset repairs saved horizontal positions, undo and drag persist through IPC', async ({ page }) => {
      test.setTimeout(45_000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await open(page)
      const initial = await positions(page)
      expect(new Set(Object.values(initial).map(position => position.y)).size).toBe(1)
      const reset = toolbar(page).getByRole('button', { name: '恢复默认布局', exact: true })
      await reset.click()
      const confirmation = page.getByRole('dialog')
      await expect(confirmation).toBeVisible()
      expect(await page.evaluate(() => (window as any).workbenchFixture.saves)).toEqual([])
      await confirmation.getByRole('button', { name: '恢复', exact: true }).click()
      await expect.poll(async () => new Set(Object.values(await positions(page)).map(position => position.y)).size).toBeGreaterThan(1)
      const restored = await positions(page)
      expect(restored[rootId].y).toBeLessThan(restored[childId].y)
      expect(restored[rootId].y).toBeLessThan(restored[siblingId].y)
      expect(restored[rootId].x).toBe((restored[childId].x + restored[siblingId].x) / 2)
      await expect.poll(() => page.evaluate(() => (window as any).workbenchFixture.saves.length)).toBe(1)
      // Reset clears persisted overrides; the production layout derives the
      // hierarchy above. Dragging below must save explicit coordinates again.
      expect(await page.evaluate(() => (window as any).workbenchFixture.saves[0])).toEqual({ cwd: 'C:/fixture', id: `harness:project:${repoId}`, patch: { canvasLayout: {} } })
      await toolbar(page).getByRole('button', { name: '撤销恢复', exact: true }).click()
      await expect.poll(() => positions(page)).toEqual(initial)
      await expect.poll(() => page.evaluate(() => (window as any).workbenchFixture.saves.length)).toBe(2)
      await reset.click()
      await confirmation.getByRole('button', { name: '恢复', exact: true }).click()
      await expect.poll(() => positions(page)).toEqual(restored)
      await toolbar(page).getByRole('button', { name: '适应画布', exact: true }).click()
      await mkdir('.agents/.local', { recursive: true })
      await page.screenshot({ path: `.agents/.local/r6-workbench-${viewport.width}.png` })
      await expect.poll(() => page.evaluate(() => (window as any).workbenchFixture.saves.length)).toBe(3)
      const bounds = await rect(node(page, childId))
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.down()
      await page.mouse.move(bounds.x + bounds.width / 2 + 25, bounds.y + bounds.height / 2 + 30, { steps: 10 })
      await page.mouse.up()
      await expect.poll(() => page.evaluate(() => (window as any).workbenchFixture.saves.length)).toBe(4)
      const dragged = await positions(page)
      expect(dragged[childId]).not.toEqual(restored[childId])
      const saved = await page.evaluate(() => (window as any).workbenchFixture.saves.at(-1).patch.canvasLayout)
      expect(Object.keys(saved)).toEqual([childId])
      expect(saved[childId].x).toBeCloseTo(dragged[childId].x, 2)
      expect(saved[childId].y).toBeCloseTo(dragged[childId].y, 2)
      expect(errors).toEqual([])
    })

    test('pure dialog sends directly and keeps the composer usable', async ({ page }) => {
      await open(page)
      await expect(chat(page).locator('.bp-maintenance-controls')).toHaveCount(0)
      await expect(chat(page).locator('.bp-maintenance-context')).toHaveCount(0)
      await expect(chat(page).locator('.janus-chat-sidebar')).toHaveCount(0)
      await expect(chat(page).locator('.janus-chat-empty')).toBeHidden()
      const input = chat(page).locator('.janus-chat textarea')
      await insideViewport(page, input)
      await input.fill('Inspect the selected root Note')
      await input.press('Enter')
      await expect(chat(page)).toContainText('Project reply in progress')
      await insideViewport(page, input)
      const messages = await rect(chat(page).locator('.janus-chat-messages'))
      expect(messages.height).toBeGreaterThan(100)
      const request = await page.evaluate(() => (window as any).projectFixture.streams.at(-1))
      expect(request.domain).toBe('project')
      expect(request.workspaceResources).toEqual([{ workspaceId: 'ws', workspacePath: 'C:/fixture', workspaceName: 'Project', agentSessionId: 'session' }])
      expect(request.maintenanceTaskId).toBeUndefined()
    })

    test('long applied Note details keep continuous discussion and the input usable', async ({ page }) => {
      await open(page)
      const input = chat(page).locator('.janus-chat textarea')
      await input.fill('Update the complete long Note')
      await input.press('Enter')
      await expect(chat(page)).toContainText('Project reply in progress')
      await page.evaluate(() => {
        const fixture = (window as any).projectFixture
        const request = fixture.streams.at(-1)
        const change = { id: 'long-change', txId: 'tx-1', conversationId: request.conversationId, workspacePath: 'C:/fixture', createdAt: new Date().toISOString(), reason: 'Long Note updated', files: [{ uri: 'note://fixture/long', title: 'Long Note', before: 'Before', after: Array.from({ length: 200 }, (_, i) => 'Line ' + i).join('\n') }] }
        fixture.noteChanges.push(change)
        fixture.emitAgentEvent({ type: 'note_change', requestId: request.requestId, change })
        fixture.finishStream()
      })
      const card = chat(page).locator('article').filter({ hasText: 'Long Note updated' })
      await card.locator('summary').first().click()
      await card.locator('summary').nth(1).click()
      await card.getByRole('button').scrollIntoViewIfNeeded()
      await insideViewport(page, input)
      await insideViewport(page, card.getByRole('button'))
      await expect(chat(page).locator('.janus-chat-messages')).toBeVisible()
      await page.screenshot({ path: test.info().outputPath('workbench-note-change.png'), animations: 'disabled' })
    })

    test('switching workspace notifies once, resets context and stays in one session', async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await open(page, '?workbench&switch-workspace')
      const input = chat(page).locator('.janus-chat textarea')
      await input.fill('First workspace note')
      await input.press('Enter')
      await expect(chat(page)).toContainText('Project reply in progress')
      await page.evaluate(() => (window as any).projectFixture.finishStream())
      await expect(chat(page)).toContainText('First workspace note')
      await page.getByRole('button', { name: 'Switch workspace', exact: true }).click()
      const notice = chat(page).locator('.bp-maintenance-switch-notice')
      await expect(notice).toContainText('Checkout B')
      await expect(chat(page).locator('.janus-chat-sidebar')).toHaveCount(0)
      await expect(chat(page)).not.toContainText('First workspace note')
      await expect(chat(page)).not.toContainText('Project reply in progress')
      await input.fill('Second workspace note')
      await input.press('Enter')
      await expect(chat(page)).toContainText('Project reply in progress')
      const streams = await page.evaluate(() => (window as any).projectFixture.streams)
      expect(streams).toHaveLength(2)
      expect(new Set(streams.map((item: { conversationId: string }) => item.conversationId)).size).toBe(1)
      expect(streams[1].workspaceResources).toEqual([{ workspaceId: 'ws-b', workspacePath: 'C:/fixture-b', workspaceName: 'Checkout B', agentSessionId: 'session-b' }])
      await insideViewport(page, input)
      expect(errors).toEqual([])
    })
  })
}

test.describe('isolated roots folding', () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort('blockedbyclient')
    })
  })
  test('additional edgeless roots and the two original isolated roots hide and restore together', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/project.html?workbench&isolated')
    // The original graph already has two isolated roots beside its three-node tree.
    await expect(page.locator('.react-flow__node')).toHaveCount(3)
    const toggle = page.locator('.blueprint-workbench-toolbar').getByRole('button', { name: /未关联/ })
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toContainText('32')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    // Offscreen nodes are virtualized; expansion must expose isolated nodes
    // while preserving all 35 source nodes, rather than rendering 35 DOM nodes.
    await expect.poll(() => page.locator('.react-flow__node[data-id^="isolated-"]').count()).toBeGreaterThan(0)
    expect(await page.evaluate(() => (window as any).projectFixture.snapshot().graph.nodeIds.length)).toBe(35)
    await toggle.click()
    await expect(page.locator('.react-flow__node')).toHaveCount(3)
    expect(errors).toEqual([])
  })
})
