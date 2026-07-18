/**
 * @file 最小化输入对话框组件
 * @description
 *  用于替代 Electron BrowserWindow 中不可用的 window.prompt。
 *  自带遮罩层 + 居中对话框，支持回车提交 / Esc 取消 / 点击遮罩取消。
 *  样式见 ./blueprint.css（.prompt-dialog 前缀）。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface PromptDialogProps {
  open: boolean
  title: string
  label?: string
  placeholder?: string
  defaultValue?: string
  description?: ReactNode
  confirmOnly?: boolean
  tone?: 'primary' | 'danger'
  confirmText?: string
  cancelText?: string
  onConfirm: (value: string) => void
  onCancel: () => void
  validate?: (value: string) => string | null
}

export function PromptDialog({
  open,
  title,
  label,
  placeholder,
  defaultValue,
  description,
  confirmOnly = false,
  tone = 'primary',
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  validate
}: PromptDialogProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // open 切到 true 时：重置为 defaultValue 并在下一帧 focus + 全选
  useEffect(() => {
    if (!open) return
    setValue(defaultValue ?? '')
  }, [open, defaultValue])

  useEffect(() => {
    if (!open) return
    const t = requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.select()
      }
    })
    return () => cancelAnimationFrame(t)
  }, [open])

  if (!open) return null

  const trimmed = value.trim()
  const validationMsg = validate ? validate(trimmed) : null
  const canConfirm = confirmOnly || (trimmed.length > 0 && !validationMsg)

  const submit = () => {
    if (!canConfirm) return
    onConfirm(trimmed)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  // 遮罩点击：仅当点击的是遮罩本身（而非内部对话框）时才取消
  const onOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel()
  }

  return (
    <div className="prompt-dialog__overlay" onMouseDown={onOverlayClick}>
      <div className="prompt-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="prompt-dialog__title">{title}</div>

        {description ? <div className="prompt-dialog__description">{description}</div> : null}
        {!confirmOnly && label ? <label className="prompt-dialog__label">{label}</label> : null}

        {!confirmOnly ? (
          <input
            ref={inputRef}
            className="prompt-dialog__input"
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
          />
        ) : null}

        {validationMsg ? <div className="prompt-dialog__error">{validationMsg}</div> : null}

        <div className="prompt-dialog__actions">
          <button className="blueprint-btn" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`blueprint-btn ${tone === 'danger' ? 'blueprint-btn--danger' : 'blueprint-btn--primary'}`}
            onClick={submit}
            disabled={!canConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
