import { expect, test } from '@playwright/test'
import { rm } from 'node:fs/promises'
import { createArchitectWorkspace } from '../helpers/architect-workspace'
import { readCorpus } from '../helpers/note-corpus'

for (const surface of ['', '&workbench']) test(`pure Note architect cross-module links, return and focus ${surface}`, async ({ page }) => {
  const f = await createArchitectWorkspace()
  try {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(graph => { (window as any).noteCorpus = graph }, f.blueprint)
    const corpus = await readCorpus(f.root)
    await page.exposeFunction('readCorpusNote', (uri: string) => corpus.read(uri))
    await page.goto('/blueprint-architecture.html?corpus&cwd=' + encodeURIComponent(f.root) + surface)
    const card = (title: string) => page.locator('.react-flow__node').filter({ has: page.locator('.bp-node-card__title', { hasText: new RegExp(`^${title}$`) }) })
    const nav = page.getByRole('navigation', { name: '模块导航' })
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Architect plan')
    await card('Reader module').dblclick()
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Reader module')
    await expect(card('Reader module')).toBeVisible()
    await expect(card('Shared requirement')).toHaveCount(0)
    await card('Reader module').click()
    await page.locator('.bp-browser-related > summary').click()
    const related = page.getByRole('region', { name: '决策与相关工作' })
    await expect(related.getByRole('button', { name: 'Shared decision', exact: true })).toHaveCount(1)
    await expect(related).toContainText('验收依据 AC-1')
    await expect(related).toContainText('Reader task → Shared requirement')
    await related.getByRole('button', { name: 'Shared requirement', exact: true }).click()
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Architect plan')
    await expect(page.locator('.bp-node-detail')).toContainText('Reader and Planned module share one contract.')
    await nav.getByRole('button', { name: '返回', exact: true }).click()
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Reader module')
    await page.evaluate(() => (window as any).architectureFixture.focus('Shared decision'))
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Architect plan')
    await expect(page.locator('.bp-node-detail')).toContainText('Use one shared format.')
    expect(errors).toEqual([])
    expect(await page.evaluate(() => (window as any).workbenchFixture.saves)).toEqual([])
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
