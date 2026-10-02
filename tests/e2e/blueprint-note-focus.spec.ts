import { expect, test, type Page } from '@playwright/test'

const root = '44444444-4444-4333-8333-444444444444'
const child = '55555555-5555-4555-8555-555555555555'
const chat = (page: Page) => page.locator('.blueprint-workbench-janus-slot')
async function focus(page: Page, options: { id?: string; mode?: string; focus?: string; ids?: string[] } = {}) {
  await page.evaluate(options => {
    const fixture = (window as any).projectFixture
    const request = fixture.streams.at(-1)
    const graph = fixture.snapshot().graph
    const ids = options.ids ?? ['44444444-4444-4333-8333-444444444444', '55555555-5555-4555-8555-555555555555']
    fixture.emitAgentEvent({ type: 'note_focus', requestId: request.requestId, focus: {
      id: options.id ?? crypto.randomUUID(), conversationId: request.conversationId, workspacePath: 'C:/fixture', mode: options.mode ?? 'scope', focus: options.focus ?? 'auto', reason: 'Related architecture and task',
      notes: ids.map((id, i) => ({ uri: graph.nodes[id]?.sourceUri ?? 'note://missing/' + id, title: graph.nodes[id]?.title ?? 'Missing Note', role: i ? 'reference' : 'target', reason: i ? 'Background decision' : 'Current goal' })),
    } })
  }, options)
}
const transform = (page: Page) => page.locator('.react-flow__viewport').evaluate(element => getComputedStyle(element).transform)
test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error })
  await page.goto('/project.html?workbench')
  await chat(page).locator('textarea').fill('Find the relevant Notes')
  await chat(page).locator('textarea').press('Enter')
  await expect(chat(page)).toContainText('Project reply in progress')
  await expect(page.locator('.react-flow__node')).toHaveCount(5)
})

test('multi-Note highlight, connected edges and scope controls leave mouse selection unchanged', async ({ page }) => {
  const detail = await page.locator('.bp-node-detail').textContent()
  await expect(chat(page)).not.toContainText('直接告诉 Janus')
  await focus(page)
  await expect(page.locator('.bp-assistant-target')).toHaveCount(1)
  await expect(page.locator('.bp-assistant-reference')).toHaveCount(1)
  await expect(page.locator('.bp-assistant-edge')).toHaveCount(1)
  expect(await page.locator('.bp-node-detail').textContent()).toBe(detail)
  const scope = chat(page).locator('.bp-note-scope')
  await scope.locator('summary').click()
  await expect(scope).toContainText('Current goal')
  await scope.getByRole('button', { name: /固定|Pin/ }).first().click()
  await scope.getByRole('button', { name: /移除|Remove/ }).nth(1).click()
  await focus(page, { ids: [child] })
  await expect(scope.getByRole('button', { name: /固定|Pin/ })).toHaveCount(1)
  await expect(scope.getByRole('button', { name: /固定|Pin/ })).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: test.info().outputPath('working-note-scope.png'), animations: 'disabled' })
})

test('automatic Note access visibly outlines nodes without moving the canvas', async ({ page }) => {
  const before = await transform(page)
  const detail = await page.locator('.bp-node-detail').textContent()
  await focus(page, { mode: 'display', focus: 'none' })
  await expect(page.locator('.bp-assistant-target .bp-node-card')).toHaveCSS('outline-style', 'solid')
  await expect(page.locator('.bp-assistant-target .bp-node-card')).toHaveCSS('outline-width', '3px')
  await expect(page.locator('.bp-assistant-reference .bp-node-card')).toHaveCSS('outline-style', 'dashed')
  expect(await transform(page)).toBe(before)
  expect(await page.locator('.bp-node-detail').textContent()).toBe(detail)
})

test('a repeated scope does not move the viewport; historical locate changes only the highlight', async ({ page }) => {
  await focus(page, { id: 'first' })
  await expect(page.locator('.bp-assistant-target')).toHaveCount(1)
  await page.waitForTimeout(250)
  const before = await transform(page)
  await focus(page, { id: 'repeat' })
  await page.waitForTimeout(250)
  expect(await transform(page)).toBe(before)
  await focus(page, { id: 'new', ids: [child], focus: 'none' })
  const scope = await chat(page).locator('.bp-note-scope').textContent()
  const history = chat(page).locator('.bp-note-locations details').first()
  await history.locator('summary').click()
  await history.getByRole('button').click()
  await expect(page.locator('.bp-assistant-reference')).toHaveCount(1)
  expect(await chat(page).locator('.bp-note-scope').textContent()).toBe(scope)
})

test('an active canvas gesture suppresses automatic focus with no delayed jump', async ({ page }) => {
  const canvas = page.locator('.react-flow__pane')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + 30, box.y + 30)
  await page.mouse.down()
  const before = await transform(page)
  await focus(page, { ids: [child] })
  await expect(page.locator('.bp-assistant-target')).toHaveCount(1)
  await page.mouse.up()
  await page.waitForTimeout(1700)
  expect(await transform(page)).toBe(before)
  await chat(page).locator('.bp-note-scope header button').first().click()
  await expect.poll(() => transform(page)).not.toBe(before)
})

test('missing references are reported and clearing conversation clears scope and history', async ({ page }) => {
  await focus(page, { ids: ['missing'] })
  await expect(chat(page).locator('.bp-note-scope [role=status]')).toContainText('Missing Note')
  await chat(page).locator('.bp-maintenance-clear').click()
  await expect(chat(page).locator('.bp-note-scope')).toHaveCount(0)
  await expect(chat(page).locator('.bp-note-locations details')).toHaveCount(0)
  await expect(page.locator('.bp-assistant-target')).toHaveCount(0)
})

test('explicit location reveals a folded target and editing blocks automatic motion', async ({ page }) => {
  await page.locator(`.react-flow__node[data-id="${root}"] .bp-node-card__collapse`).click()
  await expect(page.locator(`.react-flow__node[data-id="${child}"]`)).toHaveCount(0)
  await focus(page, { ids: [child], focus: 'explicit' })
  await expect(page.locator(`.react-flow__node[data-id="${child}"]`)).toBeVisible()
  await page.waitForTimeout(250)
  await page.locator('.blueprint-workbench-detail-slot').evaluate(element => { const input = document.createElement('input'); element.append(input); input.focus() })
  const before = await transform(page)
  await focus(page, { ids: [root] })
  await page.waitForTimeout(250)
  expect(await transform(page)).toBe(before)
})
