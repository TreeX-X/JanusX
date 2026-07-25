import { JanusChat } from './JanusChat'
import { useJanusChatController } from './JanusChatProvider'
import { useWorkspaceStore } from '@/stores/workspace'
import { useEffect } from 'react'

export function JanusChatPane({ focused }: { focused: boolean }) {
  const chat = useJanusChatController()
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)

  useEffect(() => {
    if (activeWorkspaceId) chat.resourceController.ensureEmbeddedWorkspace(activeWorkspaceId)
  }, [activeWorkspaceId, chat.resourceController.ensureEmbeddedWorkspace])

  return (
    <JanusChat
      visible
      workspace
      focused={focused}
      modeColor="#ff7830"
      messages={chat.messages}
      pendingContent={chat.pendingContent}
      isStreaming={chat.isStreaming}
      error={chat.error}
      modelOptions={chat.modelOptions}
      activeModel={chat.activeModel}
      modelNotice={chat.modelNotice}
      onCycleModel={chat.cycleModel}
      onSelectModel={chat.selectModel}
      onSend={chat.send}
      onStop={chat.stop}
      onRetry={chat.retry}
      onClear={chat.clear}
      onOpenLlmConfig={() => window.dispatchEvent(new Event('janus:open-llm-settings'))}
      resourceController={chat.resourceController}
    />
  )
}
