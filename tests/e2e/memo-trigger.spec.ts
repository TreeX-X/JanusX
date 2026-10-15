import { expect, test } from '@playwright/test'

for (const theme of ['dark', 'planche']) {
  test(`memo uses an inline composer action without a dedicated row in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/memo.html?island=1&theme=${theme}`)
    await page.getByRole('tab', { name: 'Chat', exact: true }).click()
    const trigger = page.getByRole('button', { name: 'Open memo on the left' })
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1000, height: 600 }]) {
      await page.setViewportSize(viewport)
      await expect(page.locator('.janus-chat-status-actions').getByRole('button', { name: 'Open memo on the left' })).toBeVisible()
      await expect(page.locator('.janus-chat-toolbar')).toBeHidden()
      await expect(page.locator('.janus-resource-scope')).toHaveCount(0)
      await expect(trigger.locator('.memo-trigger-label')).toBeHidden()
      await expect(trigger).toHaveAttribute('title', 'Open memo on the left')
      // Read all boxes in one frame: the island can still be settling after resize.
      const { box, composer, clear } = await trigger.evaluate(element => ({
        box: element.getBoundingClientRect().toJSON(),
        composer: element.closest('.janus-chat-input-wrapper')!.getBoundingClientRect().toJSON(),
        clear: element.parentElement!.querySelector('.janus-chat-clear-button')!.getBoundingClientRect().toJSON(),
      }))
      expect(box.width).toBeLessThanOrEqual(28)
      expect(box.x).toBeGreaterThanOrEqual(composer.x)
      expect(box.x + box.width).toBeLessThanOrEqual(composer.x + composer.width)
      expect(Math.abs(box.y + box.height / 2 - clear.y - clear.height / 2)).toBeLessThanOrEqual(2)
    }
    await page.screenshot({ path: `artifacts/memo-analysis/trigger-inline-${theme}.png` })
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await page.getByRole('button', { name: 'Expand memo files' }).click()
    await page.getByRole('button', { name: 'A', exact: true }).click()
    await expect(page.getByRole('complementary', { name: 'Milestone memo' })).toBeVisible()
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.memo-panel')).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).memoFixture.sessions.find((session: any) => session.id === (window as any).memoFixture.activeId).memoId)).toBe('00000000-0000-4000-8000-000000000001')
    await expect(page.locator('.janus-chat-toolbar')).toBeHidden()
  })
}
