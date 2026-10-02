import { expect, test } from '@playwright/test'

test('both chat entries send early decisions after more than 24 messages', async ({ page }) => {
  await page.goto('/project.html?manual-stream')
  for (const id of ['main-chat', 'blueprint-chat']) {
    const chat = page.getByTestId(id)
    for (let index = 0; index < 14; index++) {
      await chat.locator('textarea').fill(index ? `Follow-up ${index}` : `FIRST_DECISION_${id}`)
      await chat.locator('textarea').press('Enter')
      await expect(chat.locator('.janus-chat-stop')).toBeVisible()
      await page.evaluate(() => {
        const fixture = (window as any).projectFixture
        fixture.emitAgentEvent({ type: 'text_delta', requestId: fixture.streams.at(-1).requestId, delta: 'Acknowledged.' })
        fixture.finishStream()
      })
      await expect(chat.locator('.janus-chat-stop')).toHaveCount(0)
    }
    const messages = await page.evaluate(() => (window as any).projectFixture.streams.at(-1).messages)
    expect(messages).toHaveLength(27)
    expect(messages[0].content).toBe(`FIRST_DECISION_${id}`)
  }
})

test('summary status and checkpoint travel on the next turn; clear removes them', async ({ page }) => {
  await page.goto('/project.html?workbench&manual-stream')
  const chat = page.locator('.blueprint-workbench-janus-slot')
  await chat.locator('textarea').fill('Keep the first constraint')
  await chat.locator('textarea').press('Enter')
  await expect(chat.locator('.janus-chat-stop')).toBeVisible()
  await page.evaluate(() => {
    const fixture = (window as any).projectFixture
    fixture.emitAgentEvent({ type: 'context_state', requestId: fixture.streams.at(-1).requestId,
      state: { phase: 'compacting', usedTokens: 13000, windowTokens: 16384, source: 'estimated' } })
  })
  await expect(chat.locator('.janus-context-indicator')).toContainText(/Summarizing|正在压缩/)
  await page.evaluate(() => {
    const fixture = (window as any).projectFixture
    fixture.emitAgentEvent({ type: 'context_state', requestId: fixture.streams.at(-1).requestId,
      state: { phase: 'compacted', usedTokens: 3000, windowTokens: 16384, source: 'estimated', checkpoint: {
        summary: 'Preserve the first constraint', prefixHash: 'a'.repeat(64), coveredMessages: 0, scopeKey: 'fixture',
      } } })
    fixture.finishStream()
  })
  await expect(chat.locator('.janus-context-indicator')).toContainText(/original history retained|原始记录保留/)
  await expect(chat).toContainText('Keep the first constraint')
  await chat.locator('textarea').fill('Continue')
  await chat.locator('textarea').press('Enter')
  await expect(chat.locator('.janus-chat-stop')).toBeVisible()
  const request = await page.evaluate(() => (window as any).projectFixture.streams.at(-1))
  expect(request.contextCheckpoint.summary).toBe('Preserve the first constraint')
  await chat.locator('.bp-maintenance-clear').click()
  await expect(chat.locator('.janus-context-indicator')).toHaveCount(0)
  await chat.locator('textarea').fill('Fresh conversation')
  await chat.locator('textarea').press('Enter')
  await expect(chat.locator('.janus-chat-stop')).toBeVisible()
  const fresh = await page.evaluate(() => (window as any).projectFixture.streams.at(-1))
  expect(fresh.contextCheckpoint).toBeUndefined()
  expect(fresh.contextEpoch).toBeGreaterThan(request.contextEpoch ?? 0)
})

test('the original transcript survives 200 messages and displays earlier pages on demand', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('project-conversations', JSON.stringify({ version: 1, activeConversationId: 'long-history', conversations: [{
    id: 'long-history', title: 'Long history', createdAt: 1, updatedAt: 205, attachedWorkspaceIds: [], toolTraces: [],
    messages: Array.from({ length: 205 }, (_, index) => ({ id: String(index), role: index % 2 ? 'assistant' : 'user', content: `Archived decision ${index}`, timestamp: index + 1 })),
  }] })))
  await page.goto('/project.html')
  const chat = page.getByTestId('main-chat')
  await expect(chat.locator('.janus-chat-message')).toHaveCount(100)
  await chat.getByRole('button', { name: 'Show earlier messages' }).click()
  await chat.getByRole('button', { name: 'Show earlier messages' }).click()
  await expect(chat.locator('.janus-chat-message')).toHaveCount(205)
  await expect(chat).toContainText('Archived decision 0')
})

test('manual compaction retains transcript and model window settings apply to the selected model', async ({ page }) => {
  await page.goto('/project.html?manual-stream')
  const chat = page.getByTestId('main-chat')
  for (const text of ['Preserve this decision', 'Continue with it']) {
    await chat.locator('textarea').fill(text)
    await chat.locator('textarea').press('Enter')
    await expect(chat.locator('.janus-chat-stop')).toBeVisible()
    await page.evaluate(() => {
      const fixture = (window as any).projectFixture
      fixture.emitAgentEvent({ type: 'text_delta', requestId: fixture.streams.at(-1).requestId, delta: 'Agreed.' })
      fixture.finishStream()
    })
    await expect(chat.locator('.janus-chat-stop')).toHaveCount(0)
  }
  await chat.locator('textarea').fill('/compact 2')
  await chat.locator('textarea').press('Enter')
  await expect(chat.locator('.janus-chat-stop')).toBeVisible()
  const compact = await page.evaluate(() => (window as any).projectFixture.streams.at(-1))
  expect(compact.compact).toEqual({ keepRecentUnits: 2 })
  expect(compact.messages).toHaveLength(4)
  expect(compact.messages.some((message: any) => message.content.includes('/compact'))).toBe(false)
  await page.evaluate(() => {
    const fixture = (window as any).projectFixture
    fixture.emitAgentEvent({ type: 'context_state', requestId: fixture.streams.at(-1).requestId,
      state: { phase: 'compacted', usedTokens: 1000, windowTokens: 16384, source: 'estimated' } })
    fixture.finishStream()
    ;(window as any).electron.llm.saveTerminalProvider = async (terminal: string, settings: unknown) => {
      fixture.savedProvider = { terminal, settings }
      return { success: true }
    }
  })
  await expect(chat.locator('.janus-chat-message')).toHaveCount(4)
  await expect(chat).toContainText('Preserve this decision')
  const indicator = chat.locator('.janus-context-indicator')
  await indicator.locator('summary').click()
  await indicator.locator('input').fill('128000')
  await indicator.locator('button[type="submit"]').click()
  await expect(indicator).toContainText('128,000')
  const saved = await page.evaluate(() => (window as any).projectFixture.savedProvider)
  expect(saved).toMatchObject({ terminal: 'janus', settings: { id: 'p', extra: { chatModelLimits: { 'model-a': { contextWindow: 128000 } } } } })
  await page.getByRole('button', { name: 'Choose model B', exact: true }).click()
  await expect(indicator).toHaveCount(0)
})
