import { expect, test, type Page } from '@playwright/test'

const chat = (page: Page) => page.locator('.blueprint-workbench-janus-slot')
const count = (page: Page) => page.evaluate(() => (window as any).projectFixture.streams.length)
async function send(page: Page) {
  const before = await count(page)
  await chat(page).locator('textarea').fill('Read the project Notes')
  await chat(page).locator('textarea').press('Enter')
  await expect.poll(() => count(page)).toBe(before + 1)
  await expect(chat(page).locator('.janus-chat-stop')).toBeVisible()
}
async function tool(page: Page, toolName: string, callId = toolName) {
  await page.evaluate(({ toolName, callId }) => {
    const fixture = (window as any).projectFixture
    const requestId = fixture.streams.at(-1).requestId
    fixture.emitAgentEvent({ type: 'tool_call_ready', requestId, callId, toolName, argumentKeys: ['uri'] })
    fixture.emitAgentEvent({ type: 'tool_execution_start', requestId, callId, toolName })
    fixture.emitAgentEvent({ type: 'tool_execution_end', requestId, callId, toolName, status: 'completed' })
  }, { toolName, callId })
}
async function fail(page: Page) {
  await page.evaluate(() => {
    const fixture = (window as any).projectFixture
    fixture.emitAgentEvent({ type: 'stream_error', requestId: fixture.streams.at(-1).requestId,
      error: 'The number of function response parts is not equal to the number of function call parts' })
  })
}
const elapsed = async (page: Page) => parseFloat((await chat(page).locator('.janus-chat-turn-elapsed').innerText()).replace(/[^\d.]/g, ''))

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error })
  await page.goto('/project.html?workbench')
  await send(page)
})

test('one recovery preserves elapsed time and tools; second failure stays visible', async ({ page }) => {
  await tool(page, 'note.read')
  await expect(chat(page).locator('.janus-tool-card')).toHaveCount(1)
  await expect.poll(() => elapsed(page)).toBeGreaterThanOrEqual(1)
  const before = await elapsed(page)
  await fail(page)
  await expect.poll(() => count(page)).toBe(2)
  await expect(chat(page).locator('.janus-chat-error-card')).toContainText('1/1')
  expect(await elapsed(page)).toBeGreaterThanOrEqual(before)
  await expect(chat(page).locator('.janus-tool-card')).toHaveCount(1)
  await fail(page)
  await expect(chat(page).locator('.janus-chat-retry')).toBeEnabled()
  await page.waitForTimeout(400)
  expect(await count(page)).toBe(2)
  await expect(chat(page).locator('.janus-tool-card')).toHaveCount(1)
  await expect(chat(page).locator('.janus-chat-error-card')).toContainText('function response parts')
  await chat(page).locator('.janus-chat-retry').click()
  await expect.poll(() => count(page)).toBe(3)
  await fail(page)
  await expect.poll(() => count(page)).toBe(4)
})

test('a write stays non-replayable even after the visible tool window rolls over', async ({ page }) => {
  await tool(page, 'note.write')
  for (let i = 0; i < 10; i++) await tool(page, 'note.read', `read-${i}`)
  await fail(page)
  await expect(chat(page).locator('.janus-chat-retry')).toBeEnabled()
  await page.waitForTimeout(400)
  expect(await count(page)).toBe(1)
  await expect(chat(page).locator('.janus-tool-card').first()).toBeVisible()
})

test('stop during recovery cancels the stream and ignores stale errors', async ({ page }) => {
  await fail(page)
  await expect.poll(() => count(page)).toBe(2)
  await chat(page).locator('.janus-chat-stop').click()
  await expect(chat(page).locator('.janus-chat-stop')).toHaveCount(0)
  await fail(page)
  await page.waitForTimeout(400)
  expect(await count(page)).toBe(2)
})

test('successful recovery clears the error', async ({ page }) => {
  await fail(page)
  await expect.poll(() => count(page)).toBe(2)
  await page.evaluate(() => (window as any).projectFixture.finishStream())
  await expect(chat(page).locator('.janus-chat-error-card')).toHaveCount(0)
})

test('an unknown tool prevents automatic replay', async ({ page }) => {
  await tool(page, 'terminal.execute')
  await fail(page)
  await expect(chat(page).locator('.janus-chat-retry')).toBeEnabled()
  await page.waitForTimeout(400)
  expect(await count(page)).toBe(1)
})

test('a newer user instruction is preserved without replaying the older request', async ({ page }) => {
  await chat(page).locator('textarea').fill('Do not modify anything')
  await chat(page).locator('textarea').press('Enter')
  await expect(chat(page)).toContainText('Do not modify anything')
  await fail(page)
  await expect(chat(page).locator('.janus-chat-retry')).toBeEnabled()
  await page.waitForTimeout(400)
  expect(await count(page)).toBe(1)
  await expect(chat(page)).toContainText('Do not modify anything')
})

test('clear during recovery ignores late events', async ({ page }) => {
  await fail(page)
  await expect.poll(() => count(page)).toBe(2)
  await chat(page).locator('.bp-maintenance-clear').click()
  await fail(page)
  await page.waitForTimeout(400)
  expect(await count(page)).toBe(2)
  await expect(chat(page).locator('.janus-chat-error-card')).toHaveCount(0)
  await expect(chat(page).locator('.janus-chat-stop')).toHaveCount(0)
})

test('tools remain visible on terminal failure without any assistant text', async ({ page }) => {
  await page.goto('/project.html?workbench&manual-stream')
  await send(page)
  await tool(page, 'note.read')
  await fail(page)
  await expect.poll(() => count(page)).toBe(2)
  await fail(page)
  await expect(chat(page).locator('.janus-chat-retry')).toBeEnabled()
  await expect(chat(page).locator('.janus-tool-card')).toHaveCount(1)
  await expect(chat(page)).not.toContainText('Project reply in progress')
})
