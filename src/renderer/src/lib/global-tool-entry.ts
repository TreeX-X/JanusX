import { useAppStore } from '@/stores/app'
import {
  findFirstBrowserPaneContent,
  findFirstMarkdownPaneContent,
  type WorkspacePaneNode,
} from '@/lib/workspace-pane'

/**
 * 全局工具入口的公共前置：把界面切回工作区正面。
 *
 * 顶栏两个工具（浏览器 / Markdown）与快捷键都经过这里，因此打开语义
 * 与终端流程解耦——不依赖 `TerminalArea` 已挂载，工作台遮盖或空白页同样可达。
 * 顺序固定为先收起工作台再打开目标 pane，避免在遮盖面上创建内容。
 */
export function focusWorkspaceFront(): void {
  const app = useAppStore.getState()
  if (app.activeWorkbench !== null) app.setActiveWorkbench(null)
}

/**
 * 打开或定位一个全局工具：先切回工作区正面，再执行各自的打开逻辑。
 * `open` 需要自行处理"已有则激活、否则创建"的复用语义。
 */
export function openGlobalTool(open: () => void | Promise<void>): void {
  focusWorkspaceFront()
  void open()
}

export interface GlobalToolOpenState {
  browser: boolean
  markdown: boolean
}

/** Reports open tools for the menu badge; open entries remain actionable to reveal them. */
export function resolveGlobalToolOpenState(paneTree: WorkspacePaneNode | null): GlobalToolOpenState {
  return {
    browser: findFirstBrowserPaneContent(paneTree) !== null,
    markdown: findFirstMarkdownPaneContent(paneTree) !== null,
  }
}
