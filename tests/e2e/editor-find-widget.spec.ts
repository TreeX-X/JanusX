import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('editor find widget controls remain clickable in a compact preview window', async () => {
  const entry = resolve('out/main/index.js')
  let root = ''
  let application: ElectronApplication | undefined
  let page: Page | undefined

  try {
    await access(entry)
    root = await mkdtemp(join(tmpdir(), 'janusx-editor-find-'))
    const userDataDir = join(root, 'user-data')
    const workspacePath = join(root, 'workspace')
    const filePath = join(workspacePath, 'find-widget.txt')
    await Promise.all([mkdir(userDataDir, { recursive: true }), mkdir(workspacePath, { recursive: true })])
    await writeFile(filePath, 'needle one\nline\nneedle two\n')

    application = await electron.launch({
      args: [entry, `--user-data-dir=${userDataDir}`],
      env: { ...process.env, ELECTRON_RENDERER_URL: '', NODE_ENV: 'production' },
    })
    page = await application.firstWindow({ timeout: 30_000 })
    const rendererUrl = new URL(page.url())
    rendererUrl.searchParams.set('editorWindow', '1')
    rendererUrl.searchParams.set('editorFile', filePath)
    rendererUrl.searchParams.set('workspacePath', workspacePath)
    await page.goto(rendererUrl.toString())
    await page.waitForSelector('.monaco-editor', { timeout: 30_000 })
    await page.setViewportSize({ width: 820, height: 520 })

    await page.locator('.monaco-editor').click()
    await page.keyboard.press('Control+f')
    const widget = page.locator('.find-widget')
    await expect(widget).toBeVisible()
    const input = page.locator('.find-widget .monaco-inputbox input, .find-widget textarea, .find-widget input').first()
    if (await input.count() === 0) {
      const snapshot = await widget.evaluate((element) => element.outerHTML)
      throw new Error(`Find widget has no input: ${snapshot}`)
    }
    await input.fill('needle')

    const previous = widget.locator('.codicon-find-previous-match').first()
    const next = widget.locator('.codicon-find-next-match').first()
    const selection = widget.locator('.codicon-find-selection').first()
    const close = widget.locator('.codicon-widget-close').first()
    for (const control of [previous, next, selection, close]) {
      await expect(control).toBeVisible()
      await expect(control).toBeEnabled()
      const expectedClass = control === previous
        ? 'codicon-find-previous-match'
        : control === next
          ? 'codicon-find-next-match'
          : control === selection
            ? 'codicon-find-selection'
            : 'codicon-widget-close'
      await expect.poll(async () => {
        const bounds = await control.boundingBox()
        if (!bounds) return null
        return page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? null, {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        })
      }).toContain(expectedClass)
    }
    const controlBoxes = await Promise.all([previous, next, selection, close].map((control) => control.boundingBox()))
    expect(controlBoxes.every((box) => box?.width === 22 && box.height === 22)).toBe(true)
    const controlCenters = controlBoxes.map((box) => box!.y + box!.height / 2)
    expect(Math.max(...controlCenters) - Math.min(...controlCenters)).toBeLessThanOrEqual(1)
    await previous.click()
    await next.click()
    await selection.click()
    await expect(close).toBeVisible()

    /*
     * The regression this guards: Monaco renders each control's label into a .context-view wrapper
     * that used to be hit-testable. Near the window edge it lands on the control it describes, so
     * the pointer hits the overlay instead of the button — :hover is lost, the overlay hides,
     * :hover returns, and the label bar flickers while clicks go nowhere.
     *
     * Checking hit-testing BEFORE hovering (as the loop above does) cannot catch it, because the
     * label only exists after the hover delay. So hover each control, wait past that delay, and
     * assert the control still owns its own center point.
     */
    // The case-sensitive / whole-word / regex toggles sit hard against the input's right edge and
    // were the controls still dead after the first fix attempt, so they are checked too. Scope to
    // the find row: the replace row carries a "Preserve Case" toggle that is hidden while replace
    // is collapsed, and a hidden control has no box to hit-test.
    const optionToggles = await widget
      .locator('.find-part .monaco-findInput .controls .monaco-custom-toggle')
      .all()
    expect(optionToggles.length).toBeGreaterThan(0)
    const hoverTargets: Array<[string, (typeof optionToggles)[number]]> = [
      ['codicon-widget-close', close],
      ['codicon-find-selection', selection],
      ...optionToggles.map((toggle) => ['monaco-custom-toggle', toggle] as [string, typeof close]),
    ]

    for (const [expectedClass, control] of hoverTargets) {
      const bounds = await control.boundingBox()
      expect(bounds).not.toBeNull()
      const x = bounds!.x + bounds!.width / 2
      const y = bounds!.y + bounds!.height / 2

      await page.mouse.move(0, 300)
      await page.mouse.move(x, y)
      await page.waitForTimeout(1_200)

      // The label is allowed to be visible — it just must not become the pointer target.
      expect(
        await page.evaluate(
          ({ px, py }) => document.elementFromPoint(px, py)?.className ?? null,
          { px: x, py: y },
        ),
      ).toContain(expectedClass)
      expect(await control.evaluate((element) => element.matches(':hover'))).toBe(true)
    }

    const hoverOverlays = page.locator('.context-view:has(> .workbench-hover-container)')
    if (await hoverOverlays.count()) {
      await expect(hoverOverlays.first()).toHaveCSS('pointer-events', 'none')
      // Click-through alone was not enough: the label still covered the control being aimed at.
      await expect(hoverOverlays.first()).toHaveCSS('visibility', 'hidden')
    }

    // With Monaco's own label suppressed, native titles are what explains each control. Monaco
    // only sets aria-label, so these come from labelFindWidgetControls().
    for (const [locator, expected] of [
      [close, 'Escape'],
      // '+' 需转义：new RegExp('Alt+L') 里 t+ 是量词，永远匹配不到字面 "Alt+L"
      [selection, 'Alt\\+L'],
      [previous, '上一个匹配'],
      [next, '下一个匹配'],
    ] as const) {
      await expect(locator).toHaveAttribute('title', new RegExp(expected))
    }
    // Find in Selection silently does nothing without a selection, so its title has to say so.
    await expect(selection).toHaveAttribute('title', /选中/)
    for (const toggle of optionToggles) {
      await expect(toggle).toHaveAttribute('title', /.+/)
    }

    const closeBounds = await close.boundingBox()
    expect(closeBounds).not.toBeNull()
    const closeX = closeBounds!.x + closeBounds!.width / 2
    const closeY = closeBounds!.y + closeBounds!.height / 2
    await page.mouse.move(closeX, closeY)
    await page.mouse.click(closeX, closeY)
    await expect(widget).toHaveAttribute('aria-hidden', 'true')
    await expect(widget).not.toBeVisible()
  } finally {
    if (application) await application.close().catch(() => undefined)
    if (root) await rm(root, { recursive: true, force: true })
  }
})
