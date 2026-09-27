import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_APP_THEME,
  normalizeAppTheme,
  THEME_CHANNELS,
} from '../../src/shared/ipc/theme'
import {
  getMonacoThemeName,
  JANUSX_DARK_THEME_NAME,
  JANUSX_PLANCHE_THEME_NAME,
} from '../../src/renderer/src/lib/monaco-theme'
import {
  getTerminalDefaultColors,
  getXtermPalette,
  createTerminalColorQueryResponder,
  TERMINAL_DEFAULT_COLORS,
  PLANCHE_TERMINAL_COLORS,
} from '../../src/shared/terminalColorQuery'
import { getThemeDefinition } from '../../src/shared/theme/registry'

describe('planche theme contract', () => {
  it('keeps planche (slate) as default and passes open theme ids through (read-side fallback)', () => {
    expect(DEFAULT_APP_THEME).toBe('planche')
    expect(normalizeAppTheme('planche')).toBe('planche')
    expect(normalizeAppTheme('dark')).toBe('dark')
    expect(normalizeAppTheme(undefined)).toBe('planche')
    // 未知 id 原样持久化，读取时由 registry 回落默认（历史 'light' 同理）
    expect(normalizeAppTheme('light')).toBe('light')
    expect(normalizeAppTheme('nope')).toBe('nope')
    expect(getThemeDefinition('nope').id).toBe('planche')
    expect(getThemeDefinition('light').id).toBe('planche')
  })

  it('exposes get/update/changed channels', () => {
    expect(THEME_CHANNELS.get).toBe('theme:get')
    expect(THEME_CHANNELS.update).toBe('theme:update')
    expect(THEME_CHANNELS.changed).toBe('theme:changed')
  })

  it('routes monaco theme names with dark fallback', () => {
    expect(getMonacoThemeName('planche')).toBe(JANUSX_PLANCHE_THEME_NAME)
    expect(getMonacoThemeName('dark')).toBe(JANUSX_DARK_THEME_NAME)
  })

  it('returns paper/ink for planche terminal probes and dark otherwise', () => {
    expect(getTerminalDefaultColors('planche')).toEqual({ ...PLANCHE_TERMINAL_COLORS })
    expect(getTerminalDefaultColors('dark')).toEqual({ ...TERMINAL_DEFAULT_COLORS })
    expect(getXtermPalette('planche').background).toBe('#EFE4C5')
    expect(getXtermPalette('dark').background).toBe('#151517')
    expect(getXtermPalette('planche').cursor).toBe('#D43D2A')
  })

  it('answers OSC 11 with the active theme background', () => {
    const dark = createTerminalColorQueryResponder(() => 'dark')
    const planche = createTerminalColorQueryResponder(() => 'planche')
    const probe = '\x1b]11;?\x1b\\'
    // rgb:EFxx/E4xx/C5xx for paper vs 15/15/17 for dark
    expect(planche.push(probe)).toContain('rgb:EFEF/E4E4/C5C5')
    expect(dark.push(probe)).toContain('rgb:1515/1515/1717')
  })

  it('pins planche overrides to additive selectors (dark stays untouched)', () => {
    const root = resolve(__dirname, '../../src/renderer/src')
    const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
    const island = read('components/janus/styles/13-janus-planche.css')
    // 全态覆盖：折叠纸胶囊墨眼 / 一级 capsule / 二级 tray-banner / 展开大眼 / 运行球
    for (const selector of [
      "[data-theme='planche'] .janus-island",
      "[data-theme='planche'] .janus-island[data-mode='order'] .janus-eye-mini",
      "[data-theme='planche'] .janus-capsule-title",
      "[data-theme='planche'] .janus-notify-tray",
      "[data-theme='planche'] .janus-notify-banner",
      "[data-theme='planche'] .janus-island-shell[data-stage='expanded'] .janus-island",
      '[data-theme=\'planche\'] .mode-running .janus-eye-lg',
      '[data-theme=\'planche\'] .janus-run-orb-popover',
      '[data-theme=\'planche\'] .janus-island[data-mode=\'running\'][data-stage=\'collapsed\']::before',
      '[data-theme=\'planche\'] .janus-island-shell[data-stage=\'collapsed\'] .janus-island',
    ]) {
      expect(island, selector).toContain(selector)
    }
    // 折叠态纸面无黑块：纸底 + 墨眼 + 零阴影
    expect(island).toContain('[data-theme=\'planche\'] .janus-island {\n  background: #EFE4C5;')
    // 无大模糊/渐变残留（扫描条纹用的 repeating 硬阶梯除外，非渐变洗色）
    expect(island).not.toMatch(/backdrop-filter:\s*blur/)
    expect(island.replaceAll('repeating-linear-gradient', '')).not.toMatch(/linear-gradient/)
    const selector = read('components/TerminalSelector.module.css')
    expect(selector).toContain(":global([data-theme='planche']) .card:hover")
    // 选择器悬浮用套印影，不用黑硬影
    expect(selector).toContain('3px 3px 0 #E8A08A')
    expect(selector).not.toContain('3px 3px 0 #1C343B')
    const switcher = read('components/WorkbenchSwitcher.module.css')
    expect(switcher).toContain(":global([data-theme='planche']) .button:hover")
    expect(switcher).toContain('#D43D2A')
    const area = read('components/TerminalArea.tsx')
    expect(area).toContain('plancheMenu')
    expect(area).not.toContain("style.background = 'rgb(36, 27, 21)'")
    // M2c：悬浮改色走 CSS 类，JS 不再直接写 style
    const hovers = readFileSync(resolve(root, 'styles/theme-hovers.css'), 'utf8')
    for (const cls of ['.tbtn-ghost:hover', '.tbtn-accent:not(:disabled):hover', '.tbtn-danger:hover', '.terminal-preset-item:hover', '.terminal-empty-new:hover']) {
      expect(hovers, cls).toContain(cls)
    }
    expect(area).toContain('terminal-preset-item')
    expect(area).toContain('terminal-empty-new')
    expect(area).not.toContain('onMouseEnter={(event) => {')
    const gitPanel = read('components/GitPanel.tsx')
    expect(gitPanel).toContain('tbtn-ghost')
    expect(gitPanel).toContain('tbtn-accent')
    expect(gitPanel).not.toContain('currentTarget.style.background')
    const sidebar = read('components/Sidebar.tsx')
    expect(sidebar).toContain('tbtn-ghost')
    expect(sidebar).toContain('tbtn-danger')
    expect(sidebar).not.toContain('currentTarget.style.background')
    // M3：预览器文字走令牌，分栏条/脚本钮 hover 走 CSS 类
    for (const viewer of [
      'components/viewers/markdown-components.tsx',
      'components/viewers/MarkdownViewer.tsx',
      'components/viewers/HtmlViewer.tsx',
      'components/viewers/PreviewModeToggle.tsx',
      'components/viewers/ImageViewer.tsx',
      'components/viewers/BinaryInfo.tsx',
      'components/FileViewerContent.tsx',
      'components/FileEditor.tsx',
    ]) {
      const source = read(viewer)
      expect(source, viewer).not.toMatch(/color:\s*'#(fff|d4d4d4|ddd|eee|aaa|888|777|555|666)'/)
    }
    expect(read('components/viewers/MarkdownViewer.tsx')).toContain('viewer-divider')
    expect(read('components/viewers/HtmlViewer.tsx')).toContain('viewer-divider')
    expect(read('components/viewers/HtmlViewer.tsx')).toContain('tbtn-accent')
    expect(read('components/FileEditor.tsx')).toContain('filetab-close')
    expect(read('components/viewers/markdown-preview.css')).toContain('var(--shell-accent-soft)')
    expect(hovers).toContain('.viewer-divider:hover')
    expect(hovers).toContain('.filetab-close:hover')
    // 展开态黑块 + 蓝图画布：纸底与卡片收敛
    const bp = readFileSync(resolve(root, 'components/blueprint/blueprint.css'), 'utf8')
    for (const selector of [
      "[data-theme='planche'] .blueprint-view",
      "[data-theme='planche'] .bp-node-card",
      "[data-theme='planche'] .bp-node-card--selected",
      "[data-theme='planche'] .bp-node-card__title",
    ]) {
      expect(bp, selector).toContain(selector)
    }
    const canvas = read('components/blueprint/BlueprintCanvas.tsx')
    expect(canvas).toContain("colorMode={plancheCanvas ? 'light' : 'dark'}")
    expect(canvas).toContain('getBlueprintStatusVisual(')
    expect(canvas).not.toContain('STATUS_VISUALS[')
    const edge = read('components/blueprint/BlueprintAdaptiveEdge.tsx')
    expect(edge).toContain('var(--shell-accent-strong)')
    // 右缘 TurnChange 浮岛：壳走 drawer 令牌，文字走 shell 令牌，增减数走 diff 令牌
    const turn = read('components/TurnChangeIsland.tsx')
    expect(turn).toContain('var(--shell-diff-add)')
    expect(turn).toContain('var(--shell-diff-del)')
    expect(turn).toContain('var(--shell-drawer)')
    expect(turn).not.toContain("background: '#000'")
    expect(turn).not.toContain("color: '#fff'")
    // diff 令牌双主题都有定义（M1 后唯一事实源为 definition.ts，CSS 由脚本生成）
    const css = readFileSync(resolve(__dirname, '../../src/renderer/src/styles/themes.generated.css'), 'utf8')
    expect(css).toContain('--shell-diff-add: #4ec9b0')
    expect(css).toContain('--shell-diff-add: #2E6B5E')
    // 右 Dock 面板 + 左栏：文字走 shell 令牌，不再硬编码白/灰字
    for (const panel of [
      'components/SessionPanel.tsx',
      'components/GitPanel.tsx',
      'components/FileExplorerTool.tsx',
      'components/TurnChangeIsland.tsx',
      'components/Sidebar.tsx',
      'components/WorktreeDialogs.tsx',
    ]) {
      const source = read(panel)
      expect(source, panel).toContain('var(--shell-text)')
      expect(source, panel).not.toMatch(/color:\s*'#(fff|d4d4d4|ddd|eee)'/)
      expect(source, panel).not.toMatch(/text-\[#(fff|d4d4d4|ddd|eee)\]/)
    }
    // 会话面板三元色同样收敛（含 diff 语义色），杜绝 ? '#ddd' 式漏网
    const session = read('components/SessionPanel.tsx')
    for (const hex of ['#d4d4d4', '#ddd', '#e06c75', '#4ec9b0']) {
      expect(session, hex).not.toContain(`'${hex}'`)
    }
    expect(session).toContain('var(--shell-diff-add)')
    expect(session).toContain('var(--shell-diff-del)')
    // 设置面板白字标签收敛到墨字（:global 加法层，吃令牌）
    for (const mod of [
      'components/LlmConfigModal.module.css',
      'components/ModelCatalogPanel.module.css',
      'components/NotificationSettingsPanel.module.css',
      'components/ProjectSettings.module.css',
      'components/AppSettingsModal.module.css',
    ]) {
      const source = read(mod)
      expect(source, mod).toContain(":global([data-theme='planche'])")
    }
    const llm = read('components/LlmConfigModal.module.css')
    expect(llm).toContain(":global([data-theme='planche']) .formGroup label")
    expect(llm).toContain(":global([data-theme='planche']) .providerName")
    const catalog = read('components/ModelCatalogPanel.module.css')
    expect(catalog).toContain(":global([data-theme='planche']) .metadata strong")
    expect(catalog).toContain(":global([data-theme='planche']) .empty strong")
    const notif = read('components/NotificationSettingsPanel.module.css')
    expect(notif).toContain(":global([data-theme='planche']) .labelText")
    const project = read('components/ProjectSettings.module.css')
    expect(project).toContain(":global([data-theme='planche']) .promptBox textarea")
    // 文件树 CSS 同样收敛到令牌
    const fileTree = read('components/file-tree/file-tree.module.css')
    expect(fileTree).toContain('color: var(--shell-text)')
    expect(fileTree).not.toMatch(/color:\s*#(d4d4d4|ccc|999)/)
  })

  it('covers expanded deep surfaces (brand/tabs/chat/monitor/roundtable/auxiliary)', () => {
    const root = resolve(__dirname, '../../src/renderer/src')
    const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
    const island = read('components/janus/styles/13-janus-planche.css')
    // 第二轮：压过 05/06/07/09/10 的 (0,5,0)+ 黑底/白字，特异性逐条到位
    for (const selector of [
      "[data-theme='planche'] .janus-island-shell[data-stage='expanded'] .janus-expanded-brand",
      "[data-theme='planche'] .janus-island-shell[data-stage='expanded'] .janus-expanded-view-button[data-active='true']",
      "[data-theme='planche'] .janus-island-shell[data-stage='expanded'][data-view='chat'] .janus-chat-message.user .janus-chat-message-content",
      "[data-theme='planche'] .janus-island-shell[data-stage='expanded'][data-view='chat'] .janus-chat-input",
      "[data-theme='planche'] .janus-island-shell[data-stage='expanded'] .janus-monitor-crt",
      "[data-theme='planche'] .janus-island-shell[data-stage='expanded'] .janus-monitor-panel",
      "[data-theme='planche'] .janus-island-shell[data-stage='expanded'] .janus-runtime-run",
      "[data-theme='planche'] .janus-island-shell[data-stage='expanded'][data-view='roundtable'] .janus-roundtable-center",
      "[data-theme='planche'] .janus-auxiliary-island",
      "[data-theme='planche'] .janus-agent-result-detail",
      "[data-theme='planche'] .janus-roundtable-artifact",
    ]) {
      expect(island, selector).toContain(selector)
    }
    // 辅助岛深色 !important 用同等回敬（仅换色），文件仍无黑底面与毛玻璃
    expect(island).toContain('.janus-auxiliary-island {\n  background: var(--paper, #EFE4C5) !important;')
    expect(island).not.toMatch(/backdrop-filter:\s*blur/)
    expect(island.replaceAll('repeating-linear-gradient', '')).not.toMatch(/linear-gradient/)
  })

  it('keeps close controls X-free on hover and papers menus/selects', () => {
    const root = resolve(__dirname, '../../src/renderer/src')
    const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
    // 红灯关闭：悬浮不冒叉（双主题统一交互），命中判定保留
    const globals = read('styles/globals.css')
    expect(globals).toContain('.modal-close-light::after,')
    expect(globals).toContain('.modal-close-light:hover::after')
    expect(globals).not.toMatch(/\.modal-close-light:hover::after\s*\{\s*color:\s*rgba/)
    const bp = readFileSync(resolve(root, 'components/blueprint/blueprint.css'), 'utf8')
    expect(bp).toContain('.blueprint-workbench-close::after,')
    expect(bp).toContain('.blueprint-workbench-close:hover::after')
    expect(bp).not.toContain('filter: brightness(1.1);')
    const knowledge = read('components/knowledge/KnowledgeWorkbench.module.css')
    expect(knowledge).toContain('.closeButton::after,')
    expect(knowledge).toContain('.closeButton:hover::after')
    // 运行球 popover 关闭：悬浮静态（13 纸面层同步无红化）
    const island = read('components/janus/styles/13-janus-planche.css')
    expect(island).toContain("[data-theme='planche'] .janus-run-orb-popover-close,")
    expect(island).toContain("[data-theme='planche'] .janus-run-orb-popover-close:hover")
    // 通用 Select：触发器 + 浮层 + 选项纸面化（:global 加法层，吃令牌）
    const select = read('components/ui/Select.module.css')
    for (const selector of [
      ":global([data-theme='planche']) .trigger",
      ":global([data-theme='planche']) .dropdown",
      ":global([data-theme='planche']) .option:hover",
      ":global([data-theme='planche']) .optionSelected",
    ]) {
      expect(select, selector).toContain(selector)
    }
    expect(select).not.toMatch(/linear-gradient/)
    // 模型菜单 / 作者行纸面化
    expect(island).toContain("[data-theme='planche'] .janus-island-shell[data-stage='expanded'][data-view='chat'] .janus-chat-model-menu {")
    expect(island).toContain("[data-theme='planche'] .janus-island-shell[data-stage='expanded'][data-view='chat'] .janus-chat-message-author {")
  })

  it('routes the workspace ⋯ menu through theme tokens', () => {
    const root = resolve(__dirname, '../../src/renderer/src')
    const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
    // 左侧工作区 ⋯ 菜单：底座吃令牌，纸面点睛走 plancheMenu 分支（与终端菜单同构）
    const sidebar = read('components/Sidebar.tsx')
    expect(sidebar).toContain('plancheMenu')
    expect(sidebar).toContain("background: 'var(--shell-chrome-raised)'")
    expect(sidebar).toContain("border: '1px solid var(--control-border)'")
    expect(sidebar).toContain('separatorClassName')
    expect(sidebar).toContain('bg-[var(--shell-border)]')
    expect(sidebar).not.toContain('rgba(25,25,25,0.98)')
    expect(sidebar).not.toContain("'1px solid rgba(255,255,255,0.09)'")
    expect(sidebar).toContain("hover:bg-[#DCCFA8]' : 'hover:bg-[rgba(255,255,255,0.06)]'")
    expect(sidebar).not.toContain('onMouseEnter={(event) => {')
  })

  it('routes knowledge surfaces through the theme (graph JS + workbench CSS)', () => {
    const root = resolve(__dirname, '../../src/renderer/src')
    const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
    // 图谱 JS 颜色：仿 getBlueprintStatusVisual，dark 快照 + 纸面映射 + 令牌边线
    const canvas = read('components/knowledge/KnowledgeGraphCanvas.tsx')
    expect(canvas).toContain('PLANCHE_KIND_DOT_COLORS')
    expect(canvas).toContain('getKnowledgeKindColor')
    expect(canvas).toContain('getThemeBase')
    expect(canvas).toContain("stroke: 'var(--shell-muted)'")
    expect(canvas).toContain("colorMode={plancheCanvas ? 'light' : 'dark'}")
    expect(canvas).not.toContain("stroke: '#8b8b93'")
    // 工作台 CSS：壳/头/图谱/列表/审查器纸面化（:global 加法层，吃令牌）
    const wb = read('components/knowledge/KnowledgeWorkbench.module.css')
    for (const selector of [
      ":global([data-theme='planche']) .header",
      ":global([data-theme='planche']) .graphCanvas",
      ":global([data-theme='planche']) .reviewCard",
      ":global([data-theme='planche']) .inspectorTitle",
      ":global([data-theme='planche']) .dotKindProposal",
      ":global([data-theme='planche']) .auditEvent strong",
      ":global([data-theme='planche']) .actionRow button:not(:disabled)",
    ]) {
      expect(wb, selector).toContain(selector)
    }
    // 助手面板：输入/标题纸面化
    const assist = read('components/knowledge/KnowledgeAssist.module.css')
    expect(assist).toContain(":global([data-theme='planche']) .searchInput")
    expect(assist).toContain(":global([data-theme='planche']) .rowTitle")
    // 卡片品类手绘标：石板单线、无辉光（种子生成已移除）
    const topo = read('components/ui/QuantumTopologyPreview.module.css')
    for (const selector of [
      ":global([data-theme='planche']) .mark",
      ":global([data-theme='planche']) .kindFact",
      ":global([data-theme='planche']) .kindWiki",
      ":global([data-theme='planche']) .kindGraph",
    ]) {
      expect(topo, selector).toContain(selector)
    }
    expect(topo).not.toMatch(/linear-gradient/)
    expect(topo).not.toMatch(/drop-shadow/)
    expect(topo).not.toMatch(/backdrop-filter/)
    // 自绘悬浮提示 pill 纸面化（title= 原生提示由系统绘制，不在主题范围内）
    const islandCss = read('components/janus/styles/13-janus-planche.css')
    expect(islandCss).toContain("[data-theme='planche'] .pull-hint {")
  })

  it('serves left-rail hover hints from ThemedTooltip, not native title', () => {
    const root = resolve(__dirname, '../../src/renderer/src')
    const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
    // 自绘提示走 portal + 令牌 + planche 加法层（display:contents 锚点不改布局）
    const tip = read('components/ui/ThemedTooltip.tsx')
    expect(tip).toContain('createPortal')
    expect(tip).toContain('role="tooltip"')
    const tipCss = read('components/ui/ThemedTooltip.module.css')
    expect(tipCss).toContain('display: contents')
    expect(tipCss).toContain(":global([data-theme='planche']) .tip")
    expect(tipCss).toContain('var(--shell-text')
    // 左侧工作区不再挂原生 title（原生黑框系统绘制，主题够不着）
    for (const file of [
      'components/Sidebar.tsx',
      'components/WorkbenchSwitcher.tsx',
      'components/team/TeamFooter.tsx',
    ]) {
      const source = read(file)
      expect(source, file).toContain('ThemedTooltip')
      expect(source, file).not.toMatch(/title=\{/)
    }
    // 右侧同样：dock 栏/页签/会话面板提示走 ThemedTooltip
    for (const file of [
      'components/right-tools/RightToolRail.tsx',
      'components/right-tools/RightToolTabs.tsx',
      'components/SessionPanel.tsx',
    ]) {
      const source = read(file)
      expect(source, file).toContain('ThemedTooltip')
      expect(source, file).not.toMatch(/title=\{/)
    }
    // 终端区同样：菜单/页签/遥测卡/底部抽屉栏提示走 ThemedTooltip，折叠箭头纸面分支
    const area = read('components/TerminalArea.tsx')
    expect(area).toContain('ThemedTooltip')
    expect(area).toContain('plancheBottomBar')
    expect(area).not.toMatch(/title=\{/)
  })
})
