/**
 * @file 远控显示契约（ToB 远程控制统一视图标准）
 * @description 所有远控入口（桌面 `RemotePanel`、双机 peer HTTPS、
 *              本地 Web 验证网关）展示工作区/文件树/终端时使用同一套形状：
 *              只读快照 + 相对路径，绝不外泄被控端绝对路径。
 *              网关与各 UI 均以此为收敛目标，后续扩展只加可选字段。
 */

/** 左栏：工作区摘要（不同步内部 layout/clis 等桌面专有配置）。 */
export interface RemoteWorkspaceView {
  id: string
  name: string
  /** 该工作区下的远控可见终端数。 */
  terminalCount: number
}

/** 右栏/中栏：文件树节点一层（子目录按需再拉，不做整树下发）。 */
export interface RemoteFileNode {
  name: string
  /** 相对工作区根的 posix 风格路径（`a/b/c`），永不含盘符与绝对路径。 */
  relPath: string
  type: 'file' | 'directory'
  hasChildren: boolean
  /** Git 忽略即置灰删除线（与桌面 FileNode 同语义），仍可操作。 */
  isGitIgnored?: boolean
}

/** 右栏：终端实时状态（输出内容走 tail/SSE，不进本视图）。 */
export interface RemoteTerminalView {
  terminalId: string
  workspaceId: string
  status: 'idle' | 'running' | 'exited'
  /** 输出序号：SSE 续流与轮询去重依据。 */
  seq: number
}

/** SSE 终端流帧（`GET /api/view/stream` 的 event data）。 */
export interface RemoteStreamFrame {
  terminalId: string
  /** 本次新增输出（首帧为回放裁剪后的尾部）。 */
  chunk: string
  seq: number
  status: 'idle' | 'running' | 'exited'
  /** 环形缓冲截头/终端重建导致非增量时为 true：客户端应先清屏再写，避免重复堆积。 */
  reset?: boolean
}
