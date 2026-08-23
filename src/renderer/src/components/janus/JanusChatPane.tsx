import { JanusChat } from './JanusChat'
import { useJanusChatController } from './JanusChatProvider'

export function JanusChatPane({ focused, conversationId }: { focused: boolean; conversationId: string }) {
  const chat = useJanusChatController(conversationId)

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
      onSelectModel={chat.selectModel}
      onSend={chat.send}
      onRewrite={chat.rewrite}
      onStop={chat.stop}
      onRetry={chat.retry}
      onClear={chat.clear}
      resourceController={chat.resourceController}
      conversationController={chat}
    />
  )
}
