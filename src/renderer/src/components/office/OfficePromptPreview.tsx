import type { Terminal } from '../../types'
import type { OfficePrompt } from '../../../../shared/office'

export interface OfficePromptContext {
  requestId: number
  workspaceId: string
  relPath: string
  terminalId: string | null
  terminalPreset: Terminal['preset']
}

export interface OfficePromptPreviewState {
  prompt: OfficePrompt
  context: OfficePromptContext
}

export function canPasteOfficePrompt(context: OfficePromptContext, terminal: Terminal | null): terminal is Terminal {
  return Boolean(
    terminal &&
    context.terminalId === terminal.id &&
    context.terminalPreset === terminal.preset &&
    terminal.preset !== 'shell' &&
    terminal.status !== 'error',
  )
}

export function isOfficePromptContextCurrent(
  context: OfficePromptContext,
  workspaceId: string | null,
  relPath: string | undefined,
  terminal: Terminal | null,
): boolean {
  return context.workspaceId === workspaceId &&
    context.relPath === relPath &&
    context.terminalId === terminal?.id &&
    context.terminalPreset === (terminal?.preset ?? 'shell')
}

export function OfficePromptPreview({ preview, terminal, onPaste, onClose }: {
  preview: OfficePromptPreviewState
  terminal: Terminal | null
  onPaste: (context: OfficePromptContext, text: string) => boolean
  onClose: () => void
}) {
  const canPaste = canPasteOfficePrompt(preview.context, terminal)
  const paste = () => {
    if (onPaste(preview.context, preview.prompt.text)) onClose()
  }
  return <div className="absolute inset-2 z-20 flex flex-col rounded border border-white/10 bg-[#171717] p-3 shadow-xl">
    <div className="mb-2 text-xs font-medium text-[#ddd]">确认 OfficeCLI 提示词</div>
    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-[#aaa]">{preview.prompt.text}</pre>
    {!canPaste && <div className="py-2 text-[10px] text-[#777]">请选择未退出的 Claude、Codex 或 OpenCode 终端；仍可复制提示词。</div>}
    <div className="mt-2 flex justify-end gap-2">
      <button className="rounded border border-white/10 px-2 py-1 text-xs text-[#aaa]" onClick={() => void navigator.clipboard.writeText(preview.prompt.text)}>复制</button>
      <button className="rounded border border-white/10 px-2 py-1 text-xs text-[#aaa]" onClick={onClose}>取消</button>
      <button className="rounded bg-[#ff7830] px-2 py-1 text-xs text-white disabled:opacity-30" disabled={!canPaste} onClick={paste}>插入（不提交）</button>
    </div>
  </div>
}
