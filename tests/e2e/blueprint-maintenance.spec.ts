import { expect, test, type Page } from '@playwright/test'

const panel = (page: Page) => page.getByTestId('blueprint-chat')
test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error })
  await page.goto('/project.html')
  await page.addStyleTag({ content: '[data-testid="main-chat"],[data-testid="task"]{display:none}.fixture-layout{padding:12px}.fixture-layout>section{display:flex;flex-direction:column;height:650px;max-width:440px;min-height:0}' })
})
async function send(page: Page) {
  await panel(page).locator('textarea').fill('Update the two Notes using our discussion')
  await panel(page).locator('textarea').press('Enter')
  await expect(panel(page)).toContainText('Project reply in progress')
}
async function receipt(page: Page) {
  await page.evaluate(() => {
    const fixture = (window as any).projectFixture
    const request = fixture.streams.at(-1)
    const change = { id: 'change-1', txId: 'tx-1', conversationId: request.conversationId, workspacePath: 'C:/fixture', createdAt: new Date().toISOString(), reason: 'Aligned two related Notes', files: ['First Note', 'Second Note'].map((title, i) => ({ uri: 'note://fixture/' + i, title, before: '# ' + title + '\nBefore', after: '# ' + title + '\nAfter' })) }
    fixture.noteChanges.push(change)
    fixture.emitAgentEvent({ type: 'note_change', requestId: request.requestId, change })
    fixture.finishStream()
  })
}

test('continuous discussion has no organize or approval step', async ({ page }) => {
  await send(page)
  await page.evaluate(() => (window as any).projectFixture.finishStream())
  await expect(panel(page).getByRole('button', { name: /Organize|Approve/ })).toHaveCount(0)
  await expect(panel(page)).toContainText('Update the two Notes')
  expect(await page.evaluate(() => (window as any).projectFixture.maintenance.starts.length)).toBe(0)
})

test('a multi-Note receipt refreshes the graph and shows changes without hiding discussion', async ({ page }) => {
  await send(page); await receipt(page)
  await expect(panel(page)).toContainText('Aligned two related Notes')
  await expect(panel(page)).toContainText('Project reply in progress')
  await panel(page).getByText('View changes', { exact: true }).click()
  await expect(panel(page).getByLabel('Before', { exact: true })).toHaveCount(2)
  await expect.poll(() => page.evaluate(() => (window as any).projectFixture.maintenance.refreshes.length)).toBeGreaterThan(0)
  await send(page)
  expect(await page.evaluate(() => (window as any).projectFixture.streams.length)).toBe(2)
})

test('undo succeeds and the receipt survives closing and reopening', async ({ page }) => {
  await send(page); await receipt(page)
  await panel(page).getByRole('button', { name: 'Undo this application', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).projectFixture.undoApplies)).toBe(1)
  await page.getByRole('button', { name: 'Toggle blueprint', exact: true }).click()
  await page.getByRole('button', { name: 'Toggle blueprint', exact: true }).click()
  await expect(panel(page)).toContainText('Aligned two related Notes')
  await expect(panel(page).getByRole('button', { name: 'Undo this application', exact: true })).toBeDisabled()
})

test('a conflicting undo reports failure and leaves files untouched', async ({ page }) => {
  await send(page); await receipt(page)
  await page.evaluate(() => { (window as any).projectFixture.undoConflict = true })
  await panel(page).getByRole('button', { name: 'Undo this application', exact: true }).click()
  await expect(panel(page).getByRole('alert')).toContainText('changed')
  expect(await page.evaluate(() => (window as any).projectFixture.undoApplies)).toBe(0)
})
