import { expect, test, type Locator, type Page } from '@playwright/test'

async function pointer(locator: Locator, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', options: { x?: number; y?: number; button?: number; pointerId?: number; isPrimary?: boolean } = {}) {
  await locator.dispatchEvent(type, {
    bubbles: true,
    pointerType: 'mouse',
    pointerId: options.pointerId ?? 1,
    isPrimary: options.isPrimary ?? true,
    button: options.button ?? 0,
    clientX: options.x ?? 100,
    clientY: options.y ?? 20,
  })
}

async function tap(island: Locator, point = { x: 100, y: 20 }) {
  await pointer(island, 'pointerdown', point)
  await pointer(island, 'pointerup', point)
}

function harness(page: Page) {
  return page.getByTestId('harness')
}

function islandExpandedChatButton(page: Page) {
  return page.locator('.janus-island .janus-expanded-view-button[data-view="chat"]')
}

function islandExpandedRoundtableButton(page: Page) {
  return page.locator('.janus-island .janus-expanded-view-button[data-view="roundtable"]')
}

async function expectContainedAttachLayout(trigger: Locator) {
  const triggerBox = await trigger.boundingBox()
  const prefixBox = await trigger.locator(':scope > span').nth(0).boundingBox()
  const labelBox = await trigger.locator(':scope > span').nth(1).boundingBox()
  expect(triggerBox).not.toBeNull()
  expect(prefixBox).not.toBeNull()
  expect(labelBox).not.toBeNull()
  for (const box of [prefixBox!, labelBox!]) {
    expect(box.x).toBeGreaterThanOrEqual(triggerBox!.x)
    expect(box.x + box.width).toBeLessThanOrEqual(triggerBox!.x + triggerBox!.width)
    expect(box.y).toBeGreaterThanOrEqual(triggerBox!.y)
    expect(box.y + box.height).toBeLessThanOrEqual(triggerBox!.y + triggerBox!.height)
  }
  expect(prefixBox!.x + prefixBox!.width).toBeLessThanOrEqual(labelBox!.x)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.janus-island')).toBeVisible()
})

test('approval panel is distinct, compact, and exposes explicit decisions', async ({ page }) => {
  await page.goto('/?approval=1')
  await page.getByTestId('reopen-island').click()
  await islandExpandedChatButton(page).click()

  const approval = page.getByRole('region', { name: 'Workspace edit approval' })
  const reject = approval.getByRole('button', { name: 'Reject workspace action' })
  const approve = approval.getByRole('button', { name: 'Approve workspace action' })
  await expect(approval).toBeVisible()
  await expect(approval.getByText('Approval required')).toBeVisible()
  await expect(approval.getByText('workspace.edit / write')).toBeVisible()
  await expect(reject).toBeVisible()
  await expect(approve).toBeVisible()

  const approvalBox = await approval.boundingBox()
  const rejectBox = await reject.boundingBox()
  const approveBox = await approve.boundingBox()
  expect(approvalBox).not.toBeNull()
  expect(rejectBox).not.toBeNull()
  expect(approveBox).not.toBeNull()
  expect(rejectBox!.x + rejectBox!.width).toBeLessThanOrEqual(approveBox!.x)
  expect(approveBox!.x + approveBox!.width).toBeLessThanOrEqual(approvalBox!.x + approvalBox!.width)
  await page.screenshot({ path: test.info().outputPath('approval-panel-desktop.png') })

  await page.setViewportSize({ width: 720, height: 720 })
  await expect(approval).toBeVisible()
  await expect(reject).toBeVisible()
  await expect(approve).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('approval-panel-compact.png') })

  await reject.click()
  await expect(approval).toHaveCount(0)
  await expect(harness(page)).toHaveAttribute('data-approval-decision', 'rejected')
})

test('single activation shows only the empty Knowledge peek after confirmation', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island)

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
  await expect(harness(page)).toHaveAttribute('data-stage', 'peek', { timeout: 1_000 })
  await expect(harness(page)).toHaveAttribute('data-single-count', '1')
  await expect(page.getByText('No knowledge match')).toBeVisible()
})

test('second pointerdown activates expanded exactly once and cancels single activation', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island, { x: 100, y: 20 })
  await page.waitForTimeout(80)
  await pointer(island, 'pointerdown', { x: 108, y: 24, pointerId: 2 })

  await expect(harness(page)).toHaveAttribute('data-stage', 'expanded')
  await pointer(island, 'pointerup', { x: 108, y: 24, pointerId: 2 })
  await page.waitForTimeout(500)
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
  await expect(harness(page)).toHaveAttribute('data-double-count', '1')
  await expect(harness(page)).toHaveAttribute('data-stage', 'expanded')
})

test('double activation collapses expanded Island exactly once', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island)
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 104, y: 22, pointerId: 2 })
  await pointer(island, 'pointerup', { x: 104, y: 22, pointerId: 2 })
  await expect(harness(page)).toHaveAttribute('data-stage', 'expanded')

  await tap(island, { x: 110, y: 25 })
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 114, y: 27, pointerId: 3 })
  await pointer(island, 'pointerup', { x: 114, y: 27, pointerId: 3 })

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await page.waitForTimeout(500)
  await expect(harness(page)).toHaveAttribute('data-double-count', '2')
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
})

test('expanded Chat remains clickable while Island background double activation still collapses', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island, { x: 100, y: 20 })
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 104, y: 22, pointerId: 2 })
  await pointer(island, 'pointerup', { x: 104, y: 22, pointerId: 2 })
  await expect(harness(page)).toHaveAttribute('data-stage', 'expanded')

  await page.evaluate(() => {
    document.addEventListener('pointerdown', (event) => {
      const target = event.target as Element | null
      if (!target?.closest('.janus-expanded-view-button')) return
      const islandElement = target.closest('.janus-island')
      ;(window as typeof window & { chatPointerState?: unknown }).chatPointerState = {
        defaultPrevented: event.defaultPrevented,
        pointerCaptured: islandElement?.hasPointerCapture(event.pointerId) ?? false,
      }
    }, { once: true })
  })

  await islandExpandedChatButton(page).click()
  await expect(page.locator('.janus-island-shell')).toHaveAttribute('data-view', 'chat')
  await expect(page.locator('.janus-chat')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { chatPointerState?: unknown }
  ).chatPointerState)).toEqual({ defaultPrevented: false, pointerCaptured: false })

  await tap(island, { x: 110, y: 25 })
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 114, y: 27, pointerId: 3 })
  await pointer(island, 'pointerup', { x: 114, y: 27, pointerId: 3 })

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-double-count', '2')
})

test('Roundtable keeps parchment above a discussion-only Chat with workspace attachment', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island)
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 104, y: 22, pointerId: 2 })
  await pointer(island, 'pointerup', { x: 104, y: 22, pointerId: 2 })
  await islandExpandedRoundtableButton(page).click()

  const parchment = island.locator('.janus-roundtable-state')
  const discussion = island.locator('.janus-roundtable-center .janus-chat--discussion-only')
  await expect(parchment).toBeVisible()
  const stage = island.locator('.janus-roundtable-stage')
  await expect(stage).toBeVisible()
  await expect(stage.locator('.janus-roundtable-seat')).toHaveCount(4)
  await expect(stage.getByRole('button', { name: '动态' })).toBeVisible()
  await stage.getByRole('button', { name: /JanusX，主持人/ }).click()
  await expect(stage.getByRole('button', { name: /JanusX，主持人/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(discussion).toBeVisible()
  await expect(discussion.getByRole('button', { name: 'Attach workspace' })).toBeVisible()
  await expect(discussion.locator('textarea')).toBeVisible()
  await expect(discussion.locator('.janus-chat-sidebar, .janus-chat-toolbar, .janus-chat-status-bar')).toHaveCount(0)

  for (const viewport of [{ width: 1280, height: 720 }, { width: 720, height: 720 }]) {
    await page.setViewportSize(viewport)
    const parchmentBox = await parchment.boundingBox()
    const discussionBox = await discussion.boundingBox()
    expect(parchmentBox).not.toBeNull()
    expect(discussionBox).not.toBeNull()
    expect(parchmentBox!.y + parchmentBox!.height).toBeLessThanOrEqual(discussionBox!.y + 1)
    await page.screenshot({ path: test.info().outputPath(`roundtable-${viewport.width}.png`) })
  }
})

test('Island Chat action docks the shared presentation and closes only its workspace view', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island, { x: 100, y: 20 })
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 104, y: 22, pointerId: 2 })
  await pointer(island, 'pointerup', { x: 104, y: 22, pointerId: 2 })
  await expect(harness(page)).toHaveAttribute('data-stage', 'expanded')
  await islandExpandedChatButton(page).click()

  const islandChat = page.locator('.janus-island .janus-chat')
  await expect(islandChat.getByText('Shared controller message')).toBeVisible()
  await expect(islandChat.getByText('Shared pending stream')).toBeVisible()
  const attachWorkspace = islandChat.getByRole('button', { name: 'Attach workspace' })
  await expectContainedAttachLayout(attachWorkspace)
  const defaultViewport = page.viewportSize()!
  await page.setViewportSize({ width: 720, height: 720 })
  await page.waitForTimeout(350)
  await expectContainedAttachLayout(attachWorkspace)
  await page.setViewportSize(defaultViewport)
  await page.waitForTimeout(350)
  await attachWorkspace.click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(page.getByRole('option', { name: 'Workspace Three' })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('island-chat-workspaces.png') })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(harness(page)).toHaveAttribute('data-stage', 'expanded')
  await islandChat.getByRole('button', { name: 'Attach workspace' }).click()
  await page.getByRole('option', { name: 'Workspace Three' }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(harness(page)).toHaveAttribute('data-stage', 'expanded')
  await islandChat.getByRole('button', { name: 'Embed Chat in current workspace' }).click()

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-active-workspace', 'workspace-1')
  await expect(harness(page)).toHaveAttribute('data-pane-ratio', '0.5')
  const workspaceChat = page.getByTestId('workspace-chat')
  await expect(workspaceChat).toBeVisible()
  await expectContainedAttachLayout(workspaceChat.getByRole('button', { name: 'Attach workspace' }))
  await expect(workspaceChat.getByText('Shared controller message')).toBeVisible()
  await expect(workspaceChat.getByText('Shared pending stream')).toBeVisible()
  await page.getByTestId('toggle-streaming').click()
  await workspaceChat.locator('textarea').click()
  await expect(workspaceChat.locator('textarea')).toBeFocused()

  await page.keyboard.press('Control+P')
  await expect(workspaceChat.locator('[role="listbox"][data-selection-menu="model"]')).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(harness(page)).toHaveAttribute('data-active-model', 'model-a2')

  await page.getByTestId('reopen-island').click()
  await islandExpandedChatButton(page).click()
  await expect(page.locator('.janus-chat')).toHaveCount(2)
  await expect(page.locator('.janus-island .janus-chat').getByText('Shared controller message')).toBeVisible()
  await workspaceChat.locator('textarea').focus()
  await expect(page.locator('.janus-island .janus-chat textarea')).not.toBeFocused()
  await page.keyboard.press('Tab')
  await expect(workspaceChat.locator('[role="listbox"][data-selection-menu="provider"]')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(harness(page)).toHaveAttribute('data-active-provider', 'provider-b')

  await islandChat.getByRole('button', { name: /^Embed Chat in / }).click()
  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await page.getByTestId('toggle-streaming').click()
  await page.getByTestId('close-workspace-chat').click()
  await expect(workspaceChat).toHaveCount(0)
  await expect(harness(page)).toHaveAttribute('data-clear-count', '0')
  await expect(harness(page)).toHaveAttribute('data-stop-count', '0')
  await expect(harness(page)).toHaveAttribute('data-terminal-tab-count', '1')
  await page.getByTestId('reopen-island').click()
  await islandExpandedChatButton(page).click()
  await expect(page.locator('.janus-island .janus-chat').getByText('Shared controller message')).toBeVisible()
})

test('Chat input recalls sent prompts and restores the current draft', async ({ page }) => {
  await page.getByTestId('toggle-streaming').click()
  const island = page.locator('.janus-island')
  await tap(island)
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 104, y: 22, pointerId: 2 })
  await pointer(island, 'pointerup', { x: 104, y: 22, pointerId: 2 })
  await islandExpandedChatButton(page).click()
  await page.locator('.janus-island .janus-chat').getByRole('button', { name: 'Embed Chat in current workspace' }).click()

  const input = page.getByTestId('workspace-chat').locator('textarea')
  await input.fill('Unsent draft')
  await page.keyboard.press('ArrowUp')
  await expect(input).toHaveValue('Latest recalled prompt')
  await page.keyboard.press('ArrowUp')
  await expect(input).toHaveValue('First recalled prompt')
  await page.keyboard.press('ArrowDown')
  await expect(input).toHaveValue('Latest recalled prompt')
  await page.keyboard.press('ArrowDown')
  await expect(input).toHaveValue('Unsent draft')
})

test('Chat rewrites a previous turn in place, removes its reply, and clears the visible conversation', async ({ page }) => {
  await page.getByTestId('toggle-streaming').click()
  await page.getByTestId('reopen-island').click()
  await islandExpandedChatButton(page).click()

  const chat = page.locator('.janus-island .janus-chat')
  const composer = chat.locator('.janus-chat-input')
  await chat.getByRole('button', { name: 'Edit and resubmit' }).last().click()
  const editor = chat.getByRole('textbox', { name: 'Edit history question' })
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('Latest recalled prompt')
  await expect(composer).toHaveValue('')

  await editor.fill('Latest recalled prompt, with more detail')
  await editor.press('Enter')
  await expect(harness(page)).toHaveAttribute('data-last-rewrite-id', 'prompt-two')
  await expect(harness(page)).toHaveAttribute('data-last-rewrite-content', 'Latest recalled prompt, with more detail')
  await expect(harness(page)).toHaveAttribute('data-last-sent-prompt', '')
  await expect(editor).toHaveCount(0)
  await expect(chat.getByText('Latest recalled prompt, with more detail')).toBeVisible()
  await expect(chat.getByText('Latest controller response')).toHaveCount(0)
  await expect(chat.getByText('Shared controller message')).toBeVisible()

  const clear = chat.getByRole('button', { name: 'Clear current conversation' })
  await expect(clear).toBeVisible()
  await clear.click()
  await expect(harness(page)).toHaveAttribute('data-clear-count', '1')
  await expect(composer).toHaveValue('')
})

test('model menu stays visible and keyboard-operable while Chat is streaming', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island)
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 104, y: 22, pointerId: 2 })
  await pointer(island, 'pointerup', { x: 104, y: 22, pointerId: 2 })
  await islandExpandedChatButton(page).click()

  const chat = page.locator('.janus-island .janus-chat')
  await expect(chat).toBeFocused()
  await chat.locator('.janus-chat-model-tag').click()
  const menu = chat.locator('[role="listbox"][data-selection-menu="model"]')
  await expect(menu).toBeVisible()
  await expect(chat.locator('.janus-chat-input-wrapper')).toHaveCSS('overflow', 'visible')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(harness(page)).toHaveAttribute('data-active-model', 'model-a2')
  await expect(menu).toHaveCount(0)
})

test('Island Chat switches conversations while the current thread is streaming', async ({ page }) => {
  await page.goto('/?providerStream=1')
  await page.getByTestId('fail-provider-thread').click()
  await expect(harness(page)).toHaveAttribute('data-provider-error', 'Fixture stream error')
  await page.getByTestId('start-provider-stream').click()
  await expect(harness(page)).toHaveAttribute('data-provider-streaming', 'true')
  await expect(harness(page)).toHaveAttribute('data-provider-stream-count', '2')
  const island = page.locator('.janus-island')
  await tap(island)
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 104, y: 22, pointerId: 2 })
  await pointer(island, 'pointerup', { x: 104, y: 22, pointerId: 2 })
  await islandExpandedChatButton(page).click()

  const chat = page.locator('.janus-island .janus-chat')
  const threadTrigger = chat.getByRole('button', { name: 'Select conversation' })
  await expect(threadTrigger).toBeEnabled()
  await threadTrigger.click()
  const threadMenu = chat.getByRole('menu', { name: 'Conversations' })
  await expect(threadMenu).toBeVisible()
  await expect(threadMenu.getByText('Streaming thread', { exact: true })).toBeVisible()
  await expect(threadMenu.getByText('Other thread', { exact: true })).toBeVisible()
  await expect(threadMenu.getByLabel('Generating')).toBeVisible()
  await expect(threadMenu.getByLabel('Conversation error')).toBeVisible()
  // Click the messages area centre: (8,8) sits under the open dropdown.
  await chat.locator('.janus-chat-messages').click()
  await expect(threadMenu).toHaveCount(0)
  await threadTrigger.click()
  await threadMenu.locator('.janus-chat-thread-row', { hasText: 'Other thread' }).locator('.janus-chat-thread-main').click()

  await expect(threadTrigger).toContainText('Other thread')
  await threadTrigger.click()
  await expect(chat.getByRole('menu', { name: 'Conversations' }).getByLabel('Generating')).toBeVisible()
  await expect(harness(page)).toHaveAttribute('data-provider-streaming', 'true')
  await expect(harness(page)).toHaveAttribute('data-provider-abort-count', '0')
})

test('Tab and Ctrl+P menus respond to every arrow key', async ({ page }) => {
  await page.getByTestId('toggle-streaming').click()
  const island = page.locator('.janus-island')
  await tap(island)
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 104, y: 22, pointerId: 2 })
  await pointer(island, 'pointerup', { x: 104, y: 22, pointerId: 2 })
  await islandExpandedChatButton(page).click()

  const chat = page.locator('.janus-island .janus-chat')
  const input = chat.locator('textarea')
  await expect(input).toBeFocused()
  await page.keyboard.press('Control+P')
  const modelMenu = chat.locator('[role="listbox"][data-selection-menu="model"]')
  await expect(modelMenu).toBeVisible()
  const selectedModel = modelMenu.locator('[role="option"][aria-selected="true"]')
  await expect(selectedModel).toContainText('model-a1')
  await page.keyboard.press('ArrowRight')
  await expect(selectedModel).toContainText('model-a2')
  await page.keyboard.press('ArrowLeft')
  await expect(selectedModel).toContainText('model-a1')
  await page.keyboard.press('ArrowDown')
  await expect(selectedModel).toContainText('model-a2')
  await page.keyboard.press('ArrowUp')
  await expect(selectedModel).toContainText('model-a1')
  await page.keyboard.press('Escape')
  await expect(modelMenu).toHaveCount(0)

  await page.keyboard.press('Tab')
  const providerMenu = chat.locator('[role="listbox"][data-selection-menu="provider"]')
  await expect(providerMenu).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(harness(page)).toHaveAttribute('data-active-provider', 'provider-b')

  await chat.locator('[data-selection-trigger="model"]').click()
  await expect(chat.locator('[role="listbox"][data-selection-menu="model"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await chat.locator('[data-selection-trigger="provider"]').click()
  await expect(chat.locator('[role="listbox"][data-selection-menu="provider"]')).toBeVisible()
})

test('Tab and Ctrl+P menus work before any conversation exists', async ({ page }) => {
  await page.goto('/?providerStream=1')
  await page.getByTestId('reopen-island').click()
  await islandExpandedChatButton(page).click()

  const chat = page.locator('.janus-island .janus-chat')
  await expect(chat).toHaveClass(/janus-chat--empty/)
  // The empty-state wrapper must not clip the pop-up menu (visibility checks
  // alone cannot catch overflow clipping).
  await expect(chat.locator('.janus-chat-input-wrapper')).toHaveCSS('overflow', 'visible')
  await page.keyboard.press('Control+P')
  await expect(chat.locator('[role="listbox"][data-selection-menu="model"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await chat.locator('[data-selection-trigger="provider"]').click()
  await expect(chat.locator('[role="listbox"][data-selection-menu="provider"]')).toBeVisible()
})

test('typing while the Chat root is focused does not outline the whole Chat', async ({ page }) => {
  await page.getByTestId('toggle-streaming').click()
  const island = page.locator('.janus-island')
  await tap(island)
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 104, y: 22, pointerId: 2 })
  await pointer(island, 'pointerup', { x: 104, y: 22, pointerId: 2 })
  await islandExpandedChatButton(page).click()

  const chat = page.locator('.janus-island .janus-chat')
  const input = chat.locator('textarea')
  await chat.getByText('Shared controller message').click()
  await expect(chat).toBeFocused()
  await page.keyboard.type('outside input')

  await expect(input).toHaveValue('')
  await expect(chat).toHaveCSS('outline-style', 'none')
})

test('Island Chat embeds as the only pane in a workspace with no terminal', async ({ page }) => {
  await page.getByTestId('switch-empty-workspace').click()
  await expect(harness(page)).toHaveAttribute('data-active-workspace', 'workspace-3')
  await expect(harness(page)).toHaveAttribute('data-terminal-tab-count', '0')
  await expect(harness(page)).toHaveAttribute('data-pane-tabs', '')

  await page.getByTestId('reopen-island').click()
  await islandExpandedChatButton(page).click()
  const islandChat = page.locator('.janus-island .janus-chat')
  await islandChat.getByRole('button', { name: 'Embed Chat in current workspace' }).click()

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-active-workspace', 'workspace-3')
  await expect(harness(page)).toHaveAttribute('data-terminal-tab-count', '0')
  await expect(harness(page)).toHaveAttribute('data-pane-ratio', 'single')
  await expect(harness(page)).toHaveAttribute('data-pane-tabs', 'janus-chat')
  await expect(page.getByTestId('workspace-chat')).toBeVisible()
  await expect(page.getByTestId('workspace-chat').getByText('Shared controller message')).toBeVisible()
})

test('cancelled and non-primary pointers do not activate Island', async ({ page }) => {
  const island = page.locator('.janus-island')
  await pointer(island, 'pointerdown')
  await pointer(island, 'pointercancel')
  await pointer(island, 'pointerdown', { pointerId: 2, isPrimary: false })
  await pointer(island, 'pointerup', { pointerId: 2, isPrimary: false })
  await pointer(island, 'pointerdown', { pointerId: 3, button: 2 })
  await pointer(island, 'pointerup', { pointerId: 3, button: 2 })
  await page.waitForTimeout(500)

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
  await expect(harness(page)).toHaveAttribute('data-double-count', '0')
})

test('cancelled nonmatching second press clears the pending first tap', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island)
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 140, y: 22, pointerId: 2 })
  await pointer(island, 'pointercancel', { x: 140, y: 22, pointerId: 2 })
  await page.waitForTimeout(500)

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
  await expect(harness(page)).toHaveAttribute('data-double-count', '0')
})

test('dragged nonmatching second press clears the pending first tap', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island)
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 140, y: 22, pointerId: 2 })
  await pointer(island, 'pointermove', { x: 140, y: 50, pointerId: 2 })
  await pointer(island, 'pointercancel', { x: 140, y: 50, pointerId: 2 })
  await page.waitForTimeout(500)

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
  await expect(harness(page)).toHaveAttribute('data-double-count', '0')
})

test('delayed single activation calls the latest callback identity', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island)
  await page.getByTestId('replace-single').click()

  await expect(harness(page)).toHaveAttribute('data-stage', 'peek', { timeout: 1_000 })
  await expect(harness(page)).toHaveAttribute('data-called-version', '2')
  await expect(harness(page)).toHaveAttribute('data-single-count', '1')
})

test('dragging does not leave a stale single activation', async ({ page }) => {
  const island = page.locator('.janus-island')
  await pointer(island, 'pointerdown', { x: 100, y: 20 })
  await pointer(island, 'pointermove', { x: 100, y: 100 })
  await pointer(island, 'pointerup', { x: 100, y: 100 })
  await page.waitForTimeout(500)

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
  await expect(harness(page)).toHaveAttribute('data-double-count', '0')
})

test('peek and expanded geometry stay inside desktop and compact viewports', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 720, height: 540 }]) {
    await page.setViewportSize(viewport)
    const island = page.locator('.janus-island')
    await tap(island)
    await expect(harness(page)).toHaveAttribute('data-stage', 'peek', { timeout: 1_000 })
    await expect(island).toBeInViewport()

    await tap(island)
    await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
    await tap(island)
    await page.waitForTimeout(50)
    await pointer(island, 'pointerdown', { x: 104, y: 22, pointerId: 2 })
    await pointer(island, 'pointerup', { x: 104, y: 22, pointerId: 2 })
    await expect(harness(page)).toHaveAttribute('data-stage', 'expanded')
    await expect(island).toBeInViewport()

    const box = await island.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)

    await page.reload()
    await expect(page.locator('.janus-island')).toBeVisible()
  }
})
