import { useState, useCallback, useEffect, useReducer, useRef } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import { JanusIsland } from '@/components/janus'
import { AppSettingsModal } from '@/components/AppSettingsModal'
import { KnowledgeWorkbench } from '@/components/knowledge'
import { BlueprintWorkbench } from '@/components/blueprint/BlueprintWorkbench'
import { WorkbenchSwitcher } from '@/components/WorkbenchSwitcher'
import { useJanusChat } from '@/components/janus/useJanusChat'
import type { JanusMode } from '@/components/janus'
import { KNOWLEDGE_PEEK_TIMEOUT_MS } from '@/components/janus/islandKnowledgePeek'
import { INITIAL_ISLAND_CONTROLLER_STATE, reduceIslandController } from '@/components/janus/islandController'

/* ════════════════════════════════════════════════════════════
   Titlebar �?标题栏（简化版�?
   灵动岛逻辑已提取至 janus/ 模块
   新增：LLM 配置隐藏触发器（参考神性设计原型）
   ════════════════════════════════════════════════════════════ */

export function Titlebar() {
  const [island, dispatchIsland] = useReducer(reduceIslandController, INITIAL_ISLAND_CONTROLLER_STATE)
  const { stage: islandStage, knowledge: knowledgePeek } = island
  const [isRunning, setIsRunning] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<'notifications' | 'llm'>('notifications')

  const {
    messages,
    pendingContent,
    isStreaming,
    error,
    modelOptions,
    activeModel,
    modelNotice,
    latestRecallTrace,
    send: handleChatSend,
    stop: handleChatStop,
    retry: handleChatRetry,
    clear: handleChatClear,
    cycleModel: handleChatCycleModel,
    selectModel: handleChatSelectModel,
  } = useJanusChat()

  const blueprintMode = useAppStore((s) => s.blueprintMode)
  const activeWorkbench = useAppStore((s) => s.activeWorkbench)
  const setActiveWorkbench = useAppStore((s) => s.setActiveWorkbench)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const activeTerminalId = useWorkspaceStore((s) => s.activeTerminalId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const previousActiveWorkspaceId = useRef(activeWorkspaceId)

  useEffect(() => {
    dispatchIsland({ type: 'trace', trace: latestRecallTrace })
  }, [latestRecallTrace])

  useEffect(() => {
    if (previousActiveWorkspaceId.current === activeWorkspaceId) return
    previousActiveWorkspaceId.current = activeWorkspaceId
    dispatchIsland({ type: 'invalidate' })
  }, [activeWorkspaceId])

  useEffect(() => {
    if (islandStage !== 'peek' || knowledgePeek.presentation === 'hidden') return
    const version = knowledgePeek.version
    const timer = window.setTimeout(() => {
      dispatchIsland({ type: 'timeout', version })
    }, KNOWLEDGE_PEEK_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [islandStage, knowledgePeek.presentation, knowledgePeek.version])

  /*-- Janus 模式 --*/
  const janusMode: JanusMode = !activeWorkspace
    ? 'sleep'
    : isRunning
      ? 'running'
      : blueprintMode
        ? 'analytics'
        : 'order'

  const handleIslandSingleActivate = useCallback(() => dispatchIsland({ type: 'single-activate' }), [])
  const handleIslandDoubleActivate = useCallback(() => dispatchIsland({ type: 'double-activate' }), [])
  const handleIslandDismiss = useCallback(() => dispatchIsland({ type: 'dismiss' }), [])

  const handleChatClearAndInvalidatePeek = useCallback(() => {
    handleChatClear()
    dispatchIsland({ type: 'invalidate' })
  }, [handleChatClear])

  const previousActiveTerminalId = useRef(activeTerminalId)
  useEffect(() => {
    if (previousActiveTerminalId.current !== activeTerminalId) {
      previousActiveTerminalId.current = activeTerminalId
      dispatchIsland({ type: 'terminal-changed' })
    }
  }, [activeTerminalId])


  const handleRunningChange = useCallback((running: boolean) => {
    setIsRunning(running)
  }, [])

  const handleSettingsTriggerClick = useCallback(() => {
    setSettingsInitialTab('notifications')
    setSettingsModalOpen(true)
  }, [])

  const handleOpenLlmConfig = useCallback(() => {
    setSettingsInitialTab('llm')
    setSettingsModalOpen(true)
  }, [])

  return (
    <div
      className="h-[38px] flex items-center px-3.5 select-none titlebar-drag relative overflow-visible"
      style={{
        background: 'var(--chrome-bg)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        zIndex: 9999,
      }}
    >
      {/* 红绿�?*/}
      <div className="flex gap-2 titlebar-no-drag">
        <div
          onClick={() => window.electron.invoke('window:close')}
          className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] cursor-pointer hover:brightness-110 active:brightness-90"
        />
        <div
          onClick={() => window.electron.invoke('window:minimize')}
          className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] cursor-pointer hover:brightness-110 active:brightness-90"
        />
        <div
          onClick={() => window.electron.invoke('window:maximize')}
          className="w-3 h-3 rounded-full bg-[#28c840] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] cursor-pointer hover:brightness-110 active:brightness-90"
        />
      </div>

      {/* Logo + 隐藏�?LLM 配置触发�?*/}
      <div
        className="absolute left-[70px] flex items-center gap-2 titlebar-no-drag cursor-pointer group"
        onClick={handleSettingsTriggerClick}
        title="Settings"
      >
        {/* X 形图标（悬浮时变成两个横杠） */}
        <div className="relative w-4 h-4">
          <div
            className="llm-trigger-line-1 absolute w-3.5 h-[1.5px] top-1/2 left-1/2 rounded-[1px] transition-all duration-[400ms] ease-[cubic-bezier(0.175,0.885,0.32,1.275)]"
            style={{
              background: '#888',
              transform: 'translate(-50%, -50%) rotate(45deg)',
            }}
          />
          <div
            className="llm-trigger-line-2 absolute w-3.5 h-[1.5px] top-1/2 left-1/2 rounded-[1px] transition-all duration-[400ms] ease-[cubic-bezier(0.175,0.885,0.32,1.275)]"
            style={{
              background: '#ff7830',
              transform: 'translate(-50%, -50%) rotate(-45deg)',
            }}
          />
        </div>

        {/* 文字 */}
        <span className="text-[13px] font-medium text-[#888] tracking-[0.5px] transition-all duration-[400ms] group-hover:text-white group-hover:drop-shadow-[0_0_10px_rgba(255,120,48,0.4)]">
          JanusX
        </span>

        {/* 隐藏的后缀代码（悬浮时滑出�?*/}
        <span
          className="llm-trigger-reveal font-mono text-[9px] font-semibold text-[#ff7830] tracking-[1px] opacity-0 transition-all duration-[400ms] ease-[cubic-bezier(0.175,0.885,0.32,1.275)]"
          style={{
            transform: 'translateX(-8px) scale(0.9)',
          }}
        >
          :: SETTINGS
        </span>
      </div>

      <AppSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        initialTab={settingsInitialTab}
      />

      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 titlebar-no-drag">
        <WorkbenchSwitcher />
      </div>

      <BlueprintWorkbench
        isOpen={activeWorkbench === 'blueprint'}
        onClose={() => setActiveWorkbench(null)}
      />
      <KnowledgeWorkbench
        isOpen={activeWorkbench === 'knowledge'}
        onClose={() => setActiveWorkbench(null)}
      />

      {/* 灵动�?*/}
      <div
        className="absolute top-0 titlebar-no-drag"
        style={{ zIndex: 2000 }}
      >
        <JanusIsland
          stage={islandStage}
          onSingleActivate={handleIslandSingleActivate}
          onDoubleActivate={handleIslandDoubleActivate}
          onDismiss={handleIslandDismiss}
          onRunningChange={handleRunningChange}
          messages={messages}
          pendingContent={pendingContent}
          isStreaming={isStreaming}
          error={error}
          modelOptions={modelOptions}
          activeModel={activeModel}
          modelNotice={modelNotice}
          onChatCycleModel={handleChatCycleModel}
          onChatSelectModel={handleChatSelectModel}
          onChatSend={handleChatSend}
          onChatStop={handleChatStop}
          onChatRetry={handleChatRetry}
          onChatClear={handleChatClearAndInvalidatePeek}
          onOpenLlmConfig={handleOpenLlmConfig}
          knowledgeTrace={knowledgePeek.trace}
          knowledgePeekActive={knowledgePeek.presentation !== 'hidden'}
          knowledgePeekEmpty={knowledgePeek.presentation === 'empty'}
        />
      </div>

    </div>
  )
}
