import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useWorktreeStore } from '@/stores/worktree'
import { useI18n } from '@/i18n/useI18n'
import { ModalCloseButton } from './ModalCloseButton'
import type { WorktreeInfo } from '../../../shared/ipc/worktree'
import type { Workspace } from '@/types'

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-./]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[./-]+|[./-]+$/g, '')
  return slug || 'worktree'
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0,0,0,0.28)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 5,
  color: '#ddd',
  fontSize: 12,
  padding: '7px 9px',
  outline: 'none',
  fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: '#888',
  marginBottom: 5,
}

export function WorktreeComposer({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  const { t } = useI18n('terminal')
  const createWorktree = useWorktreeStore((s) => s.createWorktree)
  const [name, setName] = useState('')
  const [branch, setBranch] = useState('')
  const [branchTouched, setBranchTouched] = useState(false)
  const [startFrom, setStartFrom] = useState('origin/main')
  const [busy, setBusy] = useState(false)

  // Orca pattern: submit closes immediately; progress, cancel, and retry
  // live on the sidebar row while creation runs in the background.
  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    const payload = {
      name: name.trim(),
      branch: branch.trim() || undefined,
      startFrom: startFrom.trim() || undefined,
    }
    onClose()
    try {
      await createWorktree(workspace.id, workspace.path, payload)
    } catch {
      // Failure lands on the sidebar progress row with retry.
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(8,8,10,0.62)', backdropFilter: 'blur(10px)', zIndex: 1000 }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="overflow-hidden"
        style={{ width: 420, background: 'rgba(22,22,22,0.98)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8 }}
      >
        <div
          className="flex justify-between items-center"
          style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="font-semibold" style={{ fontSize: 13, color: '#fff' }}>
            {t('terminal:worktree.composerTitle')}
          </div>
          <ModalCloseButton onClose={onClose} />
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('terminal:worktree.nameLabel')}</label>
            <input
              autoFocus
              value={name}
              placeholder={t('terminal:worktree.namePlaceholder')}
              onChange={(event) => {
                setName(event.target.value)
                if (!branchTouched) setBranch(slugify(event.target.value))
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
                if (event.key === 'Escape') onClose()
              }}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('terminal:worktree.branchLabel')}</label>
            <input
              value={branch}
              onChange={(event) => {
                setBranch(event.target.value)
                setBranchTouched(true)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
              }}
              style={{ ...inputStyle, fontFamily: "'SF Mono', monospace" }}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('terminal:worktree.startFromLabel')}</label>
            <input
              value={startFrom}
              onChange={(event) => setStartFrom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
              }}
              style={{ ...inputStyle, fontFamily: "'SF Mono', monospace" }}
            />
          </div>
        </div>
        <div
          className="flex justify-end"
          style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', gap: 8 }}
        >
          <button
            onClick={onClose}
            className="rounded cursor-pointer"
            style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', color: '#888' }}
          >
            {t('terminal:worktree.cancel')}
          </button>
          <button
            onClick={() => void submit()}
            disabled={!name.trim() || busy}
            className="rounded cursor-pointer"
            style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)', opacity: !name.trim() || busy ? 0.45 : 1 }}
          >
            {t('terminal:worktree.create')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function WorktreeDeleteDialog({
  workspaceId,
  workspacePath,
  worktree,
  onClose,
}: {
  workspaceId: string
  workspacePath: string
  worktree: WorktreeInfo
  onClose: (branchKept?: string) => void
}) {
  const { t } = useI18n('terminal')
  const deleteWorktree = useWorktreeStore((s) => s.deleteWorktree)
  const [status, setStatus] = useState<{ branch: string | null; dirty: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.electron.worktree
      .status(worktree.path)
      .then((result) => {
        if (alive) setStatus(result)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [worktree.path])

  const runDelete = async (force: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const result = await deleteWorktree(workspaceId, workspacePath, worktree.path, force)
      onClose(result.branchKept)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(8,8,10,0.62)', backdropFilter: 'blur(10px)', zIndex: 1000 }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="overflow-hidden"
        style={{ width: 420, background: 'rgba(22,22,22,0.98)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8 }}
      >
        <div
          className="flex justify-between items-center"
          style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="font-semibold" style={{ fontSize: 13, color: '#fff' }}>
            {t('terminal:worktree.deleteTitle')}
          </div>
          <ModalCloseButton onClose={() => { if (!busy) onClose() }} />
        </div>
        <div style={{ padding: 16, fontSize: 12, color: '#999', lineHeight: 1.6 }}>
          {t('terminal:worktree.deleteBody')}
          <div style={{ marginTop: 8, fontFamily: "'SF Mono', monospace", fontSize: 11, color: '#888' }}>
            {worktree.path}
            {status?.branch ? ` · ${status.branch}` : ''}
          </div>
          {status?.dirty && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#f0a35e', lineHeight: 1.6 }}>
              {t('terminal:worktree.dirtyWarn')}
            </div>
          )}
          {error && <div style={{ marginTop: 8, fontSize: 11, color: '#e06c75', lineHeight: 1.6 }}>{error}</div>}
        </div>
        <div
          className="flex justify-end"
          style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', gap: 8 }}
        >
          <button
            onClick={() => onClose()}
            disabled={busy}
            className="rounded cursor-pointer"
            style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', color: '#888' }}
          >
            {t('terminal:worktree.cancel')}
          </button>
          {(!status || status.dirty) && (
            <button
              onClick={() => void runDelete(true)}
              disabled={busy}
              className="rounded cursor-pointer"
              style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid rgba(224,108,117,0.35)', background: 'transparent', color: '#e06c75' }}
            >
              {t('terminal:worktree.forceDelete')}
            </button>
          )}
          <button
            onClick={() => void runDelete(false)}
            disabled={busy || (status?.dirty ?? false)}
            className="rounded cursor-pointer"
            style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)', opacity: busy || status?.dirty ? 0.45 : 1 }}
          >
            {t('terminal:worktree.deleteConfirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
