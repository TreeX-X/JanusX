import type { BrowserWindow, IpcMain } from 'electron'
import { AGENT_RUNTIME_CHANNELS, type ApprovalResult, type CreateAgentSessionInput, type ExecuteToolInput } from '../../shared/ipc/agent-runtime'
import { workspaceAgentRuntime } from '../agent/runtime/runtime'
import { registerWorkspaceTools } from '../agent/runtime/tools/workspace-tools'
import type { ResolveWorkspaceRoot } from '../office/office-workspace-guard'

let registered = false
let getMainWindow: () => BrowserWindow | null = () => null

export function registerAgentRuntimeHandlers(windowGetter: () => BrowserWindow | null, ipcMain: IpcMain, resolveWorkspaceRoot?: ResolveWorkspaceRoot): void {
  getMainWindow = windowGetter
  if (resolveWorkspaceRoot) workspaceAgentRuntime.setWorkspaceResolver(resolveWorkspaceRoot)
  if (registered) return
  registerWorkspaceTools(workspaceAgentRuntime.registry)
  registered = true
  ipcMain.handle(AGENT_RUNTIME_CHANNELS.createSession, (_event, input: CreateAgentSessionInput) => workspaceAgentRuntime.createSession(input))
  ipcMain.handle(AGENT_RUNTIME_CHANNELS.executeTool, (event, input: ExecuteToolInput) => workspaceAgentRuntime.executeTool(input, `renderer:${event.sender.id}`))
  ipcMain.handle(AGENT_RUNTIME_CHANNELS.cancelSession, (_event, sessionId: string) => workspaceAgentRuntime.cancelSession(sessionId))
  ipcMain.handle(AGENT_RUNTIME_CHANNELS.resolveApproval, (event, input: ApprovalResult) => workspaceAgentRuntime.resolveApproval(input, `renderer:${event.sender.id}`))
  ipcMain.handle(AGENT_RUNTIME_CHANNELS.getSession, (_event, sessionId: string) => workspaceAgentRuntime.getSession(sessionId))
  ipcMain.handle(AGENT_RUNTIME_CHANNELS.queryPolicyAudit, (_event, query) => workspaceAgentRuntime.queryPolicyAudit(query))
  ipcMain.handle(AGENT_RUNTIME_CHANNELS.executeFunctionCall, (event, input: ExecuteToolInput) => workspaceAgentRuntime.executeFunctionCall(input, `renderer:${event.sender.id}`))
  ipcMain.handle(AGENT_RUNTIME_CHANNELS.executePlannerStep, (event, input: ExecuteToolInput) => workspaceAgentRuntime.executePlannerStep(input, `renderer:${event.sender.id}`))
  workspaceAgentRuntime.onEvent((event) => {
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send(AGENT_RUNTIME_CHANNELS.event, event)
  })
}
