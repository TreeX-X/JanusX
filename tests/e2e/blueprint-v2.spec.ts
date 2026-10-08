import { expect, test } from '@playwright/test'

for (const surface of ['', '&workbench']) test(`v2 modules expand into labeled type frames and preserve navigation on detail return ${surface}`,  async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/blueprint-architecture.html?v2' + surface)
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
  await expect(page.locator('.bp-module-document-group')).toHaveCount(0)
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Planned module' })).toContainText('规划中')
  await expect(page.locator('.bp-node-detail')).toHaveCount(0)
  const module = page.locator('.react-flow__node').filter({ hasText: 'Reader module' })
  await module.click()
  await expect(page.locator('.bp-module-document-group')).toHaveCount(5)
  await page.getByRole('button', { name: '适应画布', exact: true }).first().click()
  await expect(page.locator('.react-flow__node')).toHaveCount(8)
  const frames = await page.locator('.bp-module-document-group').evaluateAll(elements => elements.map(element => ({ kind: element.getAttribute('data-kind'), owner: element.getAttribute('data-module-id'), border: getComputedStyle(element).borderStyle, bounds: element.getBoundingClientRect().toJSON() })))
  expect(frames.map(f => f.kind)).toEqual(['note', 'idea', 'requirement', 'decision', 'task'])
  expect(new Set(frames.map(f => f.owner)).size).toBe(1)
  expect(frames.every(f => f.border === 'dashed')).toBe(true)
  for (const kind of ['note', 'idea', 'requirement']) {
    const card = page.locator('.react-flow__node').filter({ hasText: `Child ${kind}` })
    const bounds = (await card.boundingBox())!, frame = frames.find(f => f.kind === kind)!.bounds
    expect(bounds.x).toBeGreaterThan(frame.x); expect(bounds.x + bounds.width).toBeLessThan(frame.x + frame.width)
    expect(bounds.y).toBeGreaterThan(frame.y); expect(bounds.y + bounds.height).toBeLessThan(frame.y + frame.height)
  }
  // Double-click opens detail without changing the expanded module navigation.
  await module.dblclick()
  await expect(page.locator('.bp-node-detail')).toContainText('Reader module')
  await expect(page.locator('.bp-module-document-group')).toHaveCount(5)
  const count = 5
  const viewport = await page.locator('.react-flow__viewport').getAttribute('style')
  await page.locator('.bp-node-detail .bp-panel-close').click()
  await expect(page.locator('.bp-node-detail')).toHaveCount(0)
  await expect(page.locator('.bp-module-document-group')).toHaveCount(count)
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', viewport!)
  expect(await page.evaluate(() => (window as any).workbenchFixture.saves)).toEqual([])
  expect(errors).toEqual([])
  await page.screenshot({ path: test.info().outputPath('v2-module-groups.png'), fullPage: true })
})
