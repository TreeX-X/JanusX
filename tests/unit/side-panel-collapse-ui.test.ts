import { readFile } from 'fs/promises'
import { describe, expect, it } from 'vitest'

describe('side panel collapse UI', () => {
  it('keeps both side panel surfaces mounted during width transitions', async () => {
    const [app, sidebar, globals, rightDock, rightDockStyles] = await Promise.all([
      readFile('src/renderer/src/App.tsx', 'utf8'),
      readFile('src/renderer/src/components/Sidebar.tsx', 'utf8'),
      readFile('src/renderer/src/styles/globals.css', 'utf8'),
      readFile('src/renderer/src/components/right-tools/RightDock.tsx', 'utf8'),
      readFile('src/renderer/src/components/right-tools/RightDock.module.css', 'utf8'),
    ])

    expect(app).toContain('${dockStyles.workbenchGrid}')
    expect(rightDockStyles).toContain('transition: grid-template-columns 240ms')
    expect(sidebar).toContain('className="workspace-sidebar__expanded"')
    expect(sidebar).toContain('className="workspace-sidebar__collapsed')
    expect(sidebar).not.toContain('{!sidebarCollapsed && (')
    expect(sidebar).not.toContain('{sidebarCollapsed && (')
    expect(globals).toContain(".workspace-sidebar[data-collapsed='true'] .workspace-sidebar__expanded")
    expect(rightDock).toContain('data-visible={contentVisible}')
    expect(rightDock).not.toMatch(/\s+hidden=\{!contentVisible\}/)
    expect(rightDockStyles).toContain(".panel[data-visible='false']")
    expect(rightDockStyles).not.toContain('.panel[hidden]')
  })

  it('fades the right rail panel toggle in and out instead of popping it', async () => {
    const [rail, railStyles] = await Promise.all([
      readFile('src/renderer/src/components/right-tools/RightToolRail.tsx', 'utf8'),
      readFile('src/renderer/src/components/right-tools/RightDock.module.css', 'utf8'),
    ])

    // 空栏仍然不渲染控件（见 right-tool-dock.test.ts），但开/关最后一个 tab 时
    // 由 useAnimatedOpen 挂在退出动画播完后再卸载。
    expect(rail).toContain('useAnimatedOpen(toggleVisible, RAIL_TOGGLE_MOTION_MS)')
    expect(rail).toContain('data-visible={toggleAnim.visible')
    expect(rail).not.toContain('{hasOpenTools && panelToggle && (')

    // 底部控件高度参与过渡，顶部工具图标保持固定。
    expect(railStyles).toContain(".railToggle[data-visible='true']")
    expect(railStyles).toContain('height: 40px')
    expect(railStyles).toContain('height: 0')

    // 控件与展开窗口共用一组时长：.panel 的 opacity/transform 跟 .railToggle 对齐，
    // 且 visibility 延时必须等于 JS 侧的卸载定时器，否则淡出会被提前剪断。
    const panelTransition = railStyles.match(/\.panel \{[^}]*transition:\s*([^;]+);/s)
    expect(panelTransition?.[1]).toContain('opacity 240ms')
    expect(panelTransition?.[1]).toContain('transform 320ms')
    expect(railStyles).toContain('visibility 0s linear 320ms')

    // reduced-motion 必须排在 .railToggle 之后：同特异性下写在前面会被过渡覆盖。
    const toggleIndex = railStyles.indexOf('.railToggle {')
    const reducedMotionIndex = railStyles.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(toggleIndex).toBeGreaterThan(-1)
    expect(reducedMotionIndex).toBeGreaterThan(toggleIndex)
  })
})
