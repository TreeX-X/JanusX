// Note: Real product recordings — see .agents/notes/implemented/feature/2026-09-18-product-tour.md
import { _electron as electron, expect } from '@playwright/test'
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { createDesktopTestEnv } from '../tests/e2e/desktop-test-env.ts'

const cache = resolve('.cache/product-recordings')
await mkdir(cache, { recursive: true })
const recordingRoot = await mkdtemp(join(cache, 'session-'))
const project = join(recordingRoot, 'JanusX')
execFileSync('git', ['clone', '--quiet', '--shared', resolve('.'), project])
const output = resolve('wiki/assets')
await mkdir(output, { recursive: true })
const app = await electron.launch({
  args: [resolve('out/main/index.js'), `--user-data-dir=${join(recordingRoot, 'profile')}`],
  env: {
    ...createDesktopTestEnv(recordingRoot),
    JANUSX_KNOWLEDGE_ROOT: join(recordingRoot, 'knowledge-data'),
    APPDATA: join(recordingRoot, 'app-data'),
    LOCALAPPDATA: join(recordingRoot, 'local-app-data'),
  },
})
let page
const pause = ms => page.waitForTimeout(ms)
async function record(name, actions) {
  const frames = join(recordingRoot, name)
  await mkdir(frames)
  let running = true
  let count = 0
  const capture = (async () => {
    while (running) {
      await page.screenshot({ path: join(frames, `${String(count++).padStart(4, '0')}.png`) })
      await pause(140)
    }
  })()
  try {
    await pause(900)
    await actions()
    await pause(1700)
  } finally {
    running = false
    await capture
  }
  await page.screenshot({ path: join(output, `${name}.png`) })
  const recordings = JSON.parse(await readFile(join(cache, 'latest.json'), 'utf8').catch(() => '[]'))
  const prior = recordings.findIndex(item => item.name === name)
  if (prior !== -1) recordings.splice(prior, 1)
  recordings.push({ name, frames, count })
  await writeFile(join(cache, 'latest.json'), JSON.stringify(recordings, null, 2))
  console.log(`Recorded ${name}: ${count} frames`)
}
async function command(input, text) {
  await input.focus()
  await input.pressSequentially(text, { delay: 16 })
  await input.press('Enter')
  await pause(700)
}
async function prepareShell(input) {
  await command(input, 'function prompt { "PS JanusX> " }; Clear-Host')
}
async function tool(name) {
  await page.getByRole('button', { name: new RegExp(`打开\\s*${name}\\s*工具`) }).click()
  await pause(700)
}
try {
  page = await app.firstWindow()
  page.setDefaultTimeout(12000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForFunction(() => Boolean(window.electron?.workspace))
  const workspace = await page.evaluate(path => window.electron.workspace.create({ name: 'JanusX', path }), project)
  await page.reload()
  await page.getByRole('button', { name: '稍后再说，先用本地功能' }).click()
  await page.getByRole('button', { name: 'Shell', exact: true }).click()
  const first = page.locator('.xterm-helper-textarea').first()
  await first.waitFor({ state: 'attached' })
  await pause(1200)
  await prepareShell(first)
  if (process.argv.includes('--cli')) {
    const cliPath = resolve('../janus-agentX/packages/cli/dist/cli.js')
    await command(first, `node "${cliPath}" tui --no-config`)
    await pause(2000)
    await command(first, '/help')
    await first.press('Control+Home')
    await record('janus-cli', async () => {
      await first.press('Control+p')
      await pause(1700)
      await first.press('ArrowDown')
      await pause(800)
      await first.press('ArrowDown')
      await pause(800)
      await first.press('Escape')
      await first.press('Control+Home')
      await pause(1400)
    })
  }
  if (!process.argv.includes('--experiments') && !process.argv.includes('--cli')) {
  await command(first, 'git log -6 --format="%h %<(30,trunc)%s"')
  await page.locator('main').getByRole('button', { name: 'New Terminal', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New Shell terminal', exact: true }).click()
  const second = page.locator('.xterm-helper-textarea').nth(1)
  await second.waitFor({ state: 'attached' })
  await pause(1000)
  await prepareShell(second)
  await command(second, 'npm pkg get name version scripts.dev')
  await record('terminal-split', async () => {
    const tabs = page.locator('main [role="button"][draggable="true"]')
    const tab = await tabs.nth(1).boundingBox()
    const target = await page.locator('main section').first().boundingBox()
    await page.mouse.move(tab.x + 55, tab.y + 15)
    await page.mouse.down()
    await page.mouse.move(tab.x + 70, tab.y + 65, { steps: 8 })
    await pause(500)
    await page.mouse.move(target.x + target.width - 50, target.y + target.height / 2, { steps: 24 })
    await pause(900)
    await page.mouse.up()
    await expect(page.locator('main [role="separator"]')).toHaveCount(1)
    await pause(1000)
    const divider = await page.locator('main [role="separator"]').boundingBox()
    await page.mouse.move(divider.x + 3, divider.y + 220)
    await page.mouse.down()
    await page.mouse.move(divider.x - 100, divider.y + 220, { steps: 20 })
    await page.mouse.up()
    await pause(900)
  })
  const tabs = page.locator('main [role="button"][draggable="true"]')
  const tab = await tabs.nth(1).boundingBox()
  const left = await page.locator('main section').first().boundingBox()
  await page.mouse.move(tab.x + 50, tab.y + 15)
  await page.mouse.down()
  await page.mouse.move(left.x + left.width / 2, left.y + left.height / 2, { steps: 20 })
  await page.mouse.up()
  await pause(800)
  await record('right-sidebar', async () => {
    await tool('文件')
    await pause(1000)
    await tool('Git')
    await pause(1200)
    await tool('文件')
    const editorPromise = app.waitForEvent('window')
    await page.locator('[data-file-path="package.json"]').dblclick()
    const editor = await editorPromise
    await editor.getByRole('button', { name: '嵌入主窗口工作区' }).click()
    await page.getByRole('region', { name: 'Embedded file editor' }).waitFor()
    await pause(1500)
  })
  }
  if (!process.argv.includes('--basic') && !process.argv.includes('--cli')) {
    // The blueprint is manually authored from the actual product structure.
    await page.evaluate(async cwd => {
      const api = window.electron.janus
      const bp = await api.createBlueprint(cwd, { name:'JanusX · 开发工作台', rootTitle:'JanusX', description:'从项目与终端，到协作与知识积累' })
      for (const [title, description] of [
        ['终端与分屏', '多终端标签、拖拽分屏、调整面板比例'],
        ['右侧工具栏', '文件、Git、检查点、知识助手与个人画像'],
        ['Janus Agent', '对话式 Agent、工具调用与独立 CLI'],
        ['圆桌协作', '主持人组织议题，多个角色参与讨论'],
        ['项目知识库', '候选审核、知识检索与来源追溯'],
      ]) await api.createNode(cwd, bp.id, {title, type:'feature', description}, bp.rootNodeId)
    }, project)
    await page.getByRole('button', { name: /打开蓝图工作台/ }).click()
    await page.locator('.react-flow__node').first().waitFor()
    await pause(1400)
    await page.getByRole('button', {name:/打开 Janus Copilot 控制台/}).click()
    await pause(900)
    await record('blueprint', async () => {
      await page.locator('.react-flow__node').filter({hasText:'终端与分屏'}).dblclick()
      await pause(1200)
      await page.locator('.react-flow__node').filter({hasText:'右侧工具栏'}).dblclick()
      await pause(1200)
    })
    await page.locator('.blueprint-workbench-close').click()
    await pause(1000)
    await page.evaluate(async ({ workspaceId, workspacePath }) => {
      const knowledge = window.electron.knowledge
      for (const [content, file] of [
        ['决定：桌面主进程与渲染进程通过类型化 IPC 接口交互。', 'src/shared/ipc/workspace.ts'],
        ['决定：右侧栏统一提供文件、Git、检查点、知识助手和个人画像入口。', 'src/renderer/src/right-tools/registry.ts'],
        ['决定：独立 janus-agentX 包通过本地 file 依赖接入 JanusX。', 'package.json'],
      ]) await knowledge.observe({workspaceId,workspacePath,source:'manual',type:'user-note',content,fileRefs:[file],actor:'user'})
      await knowledge.processNow()
    }, {workspaceId:workspace.id,workspacePath:project})
    await page.getByRole('button', {name:/打开知识库工作台/}).click()
    await pause(1300)
    await record('knowledge', async () => {
      const candidate = page.getByRole('button').filter({hasText:'桌面主进程'}).first()
      await candidate.click()
      await pause(1000)
      await page.getByRole('button', {name:'批准',exact:true}).click()
      await pause(1200)
      await page.getByRole('button', {name:/^知识库\s*\d/}).click()
      await pause(1000)
    })
    await page.getByRole('button', {name:'关闭知识引擎'}).click()
    await pause(1000)
    await record('roundtable', async () => {
      await page.getByRole('button', {name:'打开 Janus Island'}).dblclick()
      await pause(800)
      await page.getByRole('tab', {name:'圆桌',exact:true}).click()
      await pause(1000)
      const input = page.locator('.janus-roundtable-view textarea:visible')
      await input.fill('如何让新用户在五分钟内上手 JanusX？请从终端分屏、工具栏和项目导航三个角度讨论。')
      await pause(1800)
    })
    await page.keyboard.press('Escape')
    await pause(800)
    console.log('Experiment recordings complete')
  }
} catch (error) {
  console.error(error)
  if (page) {
    console.log((await page.locator('body').innerText()).slice(-8000))
    await page.screenshot({ path: join(cache, 'capture-error.png') })
  }
  process.exitCode = 1
} finally {
  await app.close()
  console.log(`Recordings: ${join(cache, 'latest.json')}`)
}
