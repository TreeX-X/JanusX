import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    sessionFixture: { reads: () => number; resolve: (success?: boolean) => void; emit: () => void }
  }
}

test('large session lists keep unopened bodies out of the DOM; slow reads never gate toggles', async ({ page }) => {
  await page.goto('/session-panel.html')
  const cards = page.locator('[data-session-id]')
  await expect(cards).toHaveCount(20)
  expect(await cards.locator('button').count()).toBe(20)
  const card = page.locator('[data-session-id="session-0"]')
  const fold = card.locator('button[aria-expanded]')
  await fold.click()
  await expect(card).toHaveAttribute('data-expanded', 'true')
  await expect.poll(() => page.evaluate(() => window.sessionFixture.reads())).toBe(1)
  // The IPC is still pending. Reverse immediately, then reopen without another read.
  await fold.click()
  await expect(card).toHaveAttribute('data-expanded', 'false')
  await expect(card.locator('[inert]')).toHaveCount(1)
  await fold.click()
  await page.evaluate(() => window.sessionFixture.resolve())
  await expect(card.getByText('Latest answer', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.sessionFixture.reads())).toBe(1)
  await fold.click()
  await fold.click()
  await expect(card.getByText('Latest answer', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.sessionFixture.reads())).toBe(1)
  // Live events invalidate the preview without hiding the existing answer.
  await page.evaluate(() => window.sessionFixture.emit())
  await expect.poll(() => page.evaluate(() => window.sessionFixture.reads())).toBe(2)
  await expect(card.getByText('Latest answer', { exact: true })).toBeVisible()
  await page.evaluate(() => window.sessionFixture.resolve())
})

test('session pages append only near the bottom and reset on search or scope change', async ({ page }) => {
  await page.goto('/session-panel.html')
  const cards = page.locator('[data-session-id]')
  const list = cards.first().locator('..')
  await expect(cards).toHaveCount(20)
  // The previous implementation filled all 200 cards in under 600ms.
  await page.waitForTimeout(700)
  await expect(cards).toHaveCount(20)
  await list.evaluate((element) => { element.scrollTop = 100 })
  await page.waitForTimeout(100)
  await expect(cards).toHaveCount(20)
  for (let count = 40; count <= 200; count += 20) {
    await list.evaluate((element) => { element.scrollTop = element.scrollHeight })
    await expect(cards).toHaveCount(count)
  }
  await list.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(cards).toHaveCount(200)
  // Search reaches an unloaded record, and clearing it starts a fresh page.
  const search = page.getByRole('textbox')
  await search.fill('Session 199')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toHaveAttribute('data-session-id', 'session-199')
  await search.fill('')
  await expect(cards).toHaveCount(20)
  expect(await list.evaluate((element) => element.scrollTop)).toBe(0)
  await list.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(cards).toHaveCount(40)
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await expect(cards).toHaveCount(20)
  expect(await list.evaluate((element) => element.scrollTop)).toBe(0)
  // A silent update preserves loaded pages instead of restarting pagination.
  await list.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(cards).toHaveCount(40)
  await page.evaluate(() => window.sessionFixture.emit())
  await page.waitForTimeout(700)
  await expect(cards).toHaveCount(40)
})

test('failed preview reads retry on reopen and only one card stays expanded', async ({ page }) => {
  await page.goto('/session-panel.html')
  const first = page.locator('[data-session-id="session-0"]')
  const second = page.locator('[data-session-id="session-1"]')
  const fold = first.locator('button[aria-expanded]')
  await fold.click()
  await expect.poll(() => page.evaluate(() => window.sessionFixture.reads())).toBe(1)
  await page.evaluate(() => window.sessionFixture.resolve(false))
  await fold.click()
  await fold.click()
  await expect.poll(() => page.evaluate(() => window.sessionFixture.reads())).toBe(2)
  await page.evaluate(() => window.sessionFixture.resolve())
  await expect(first.getByText('Latest answer', { exact: true })).toBeVisible()
  await second.locator('button[aria-expanded]').click()
  await expect(first).toHaveAttribute('data-expanded', 'false')
  await expect(second).toHaveAttribute('data-expanded', 'true')
  await expect(page.locator('[data-session-id][data-expanded="true"]')).toHaveCount(1)
})
