import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

// Opt-in measurements: no hardware-dependent threshold in the ordinary suite.
test('measure tools menu presentation and region resize render work', async ({ page }) => {
  test.skip(!process.env.JANUSX_PERF_LABEL, 'Run explicitly for baseline/candidate comparison')
  await page.goto('/global-tools.html')
  await expect(page.locator('[data-tools-toggle]')).toBeAttached()
  await page.waitForTimeout(500)
  const result = await page.evaluate(async () => {
    const fixture = (window as any).toolsFixture
    const longTasks: number[] = []
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => e.duration)))
    observer.observe({ type: 'longtask', buffered: false })
    const menuMs: number[] = []
    for (let i = 0; i < 30; i++) {
      const button = document.querySelector<HTMLButtonElement>('[data-id="tool-menu"]')!
      const start = performance.now()
      button.click()
      // Two rAFs allow a paint opportunity after React's commit; this is a
      // presentation proxy, not an OS-input-to-display latency measurement.
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      if (!document.querySelector('[role="menu"]')) throw Error('Menu did not open')
      menuMs.push(performance.now() - start)
      button.click()
      await new Promise(requestAnimationFrame)
    }
    fixture.resetRenderWork()
    for (let i = 0; i < 40; i++) {
      fixture.resizeTools(i % 2 ? .60 : .62)
      await new Promise(requestAnimationFrame)
    }
    await new Promise(resolve => setTimeout(resolve, 300))
    observer.disconnect()
    return { menuMs, longTasks, renderWork: fixture.renderWork() }
  })
  const sorted = [...result.menuMs].sort((a, b) => a - b)
  const summary = { ...result, menuP50Ms: sorted[14], menuP95Ms: sorted[28],
    reactActualMs: result.renderWork.reduce((sum: number, value: number) => sum + value, 0) }
  await mkdir('artifacts/performance-current', { recursive: true })
  await writeFile(`artifacts/performance-current/ui-${process.env.JANUSX_PERF_LABEL}.json`, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({ menuP50Ms: summary.menuP50Ms, menuP95Ms: summary.menuP95Ms,
    reactActualMs: summary.reactActualMs, commits: summary.renderWork.length, longTasks: summary.longTasks }))
})
