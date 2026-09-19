import { expect, test } from '@playwright/test'

const pageErrors: string[] = []
test.beforeEach(({ page }) => { pageErrors.length = 0; page.on('pageerror', (error) => pageErrors.push(error.message)) })
test.afterEach(() => expect(pageErrors).toEqual([]))

test('desktop xdo run executes with evidence, aborts mid-flight, and recovers', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/project.html')
  await page.addStyleTag({ content: '.fixture-layout { display:grid; grid-template-columns:minmax(0,1fr); gap:16px; padding:8px; } [data-testid="main-chat"], [data-testid="blueprint-chat"] { display:none; }' })
  const task = page.getByTestId('task')

  await task.getByLabel('Allowed paths', { exact: true }).fill('src/')
  await task.getByLabel('AC-1', { exact: true }).fill('The value is 42')
  await task.getByLabel('Program', { exact: true }).fill('node')
  await task.getByLabel('Arguments', { exact: true }).fill('-e\nprocess.exit(0)')
  await task.getByRole('button', { name: 'Adopt task', exact: true }).click()
  await expect(task.getByRole('button', { name: 'Prepare run', exact: true })).toBeEnabled()

  await task.getByLabel('V-manual observer', { exact: true }).fill('desktop')
  await task.getByLabel('V-manual observation', { exact: true }).fill('Read the run record; values match.')
  await task.getByLabel('Implementation and review provider', { exact: true }).selectOption('p')
  await task.getByLabel('Implementation and self-review model', { exact: true }).selectOption('model-a')

  await task.getByRole('button', { name: 'Prepare run', exact: true }).click()
  await expect(task.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
  await task.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(task.getByRole('button', { name: 'Execute and verify', exact: true })).toBeEnabled()

  await task.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(task.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled()
  await task.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(task.getByRole('button', { name: 'Execute and verify', exact: true })).toBeEnabled()
  await task.getByRole('button', { name: 'Pause', exact: true }).click()
  await task.getByRole('button', { name: 'Rebaseline', exact: true }).click()
  await expect(task.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
  await task.getByRole('button', { name: 'Start', exact: true }).click()

  await page.evaluate(() => { (window as any).projectFixture.gateExecute = true })
  await task.getByRole('button', { name: 'Execute and verify', exact: true }).click()
  await expect(task.getByRole('button', { name: 'Stop execution', exact: true })).toBeVisible()
  await task.getByRole('button', { name: 'Stop execution', exact: true }).click()
  await page.evaluate(() => { (window as any).projectFixture.gateResolve?.() })
  await expect(task).toContainText('Receipt receipt-1')
  await expect(task).toContainText('verified complete')
  await expect(task).toContainText('V-1 [command/passed]')

  const counts = await page.evaluate(() => {
    const fixture = (window as any).projectFixture
    return { prepares: fixture.prepares, starts: fixture.starts, executes: fixture.executes, runAborts: fixture.runAborts, pauses: fixture.pauses, resumes: fixture.resumes, rebaselines: fixture.rebaselines, evidence: fixture.lastExecute?.manualEvidence }
  })
  expect(counts).toMatchObject({ prepares: 1, starts: 2, executes: 1, runAborts: 1, pauses: 2, resumes: 1, rebaselines: 1 })
  expect(counts.evidence).toMatchObject([{ stepId: 'V-manual', observer: 'desktop', observation: 'Read the run record; values match.' }])
  await expect(task.getByRole('button', { name: 'Check closeout', exact: true })).toBeEnabled()
})
